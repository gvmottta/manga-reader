import pLimit from "p-limit";
import { ocrImage } from "./ocrClient.js";
import type { OcrBlock } from "./ocrClient.js";
import { translateBlocksBatch } from "./geminiTextClient.js";
import {
  getTranslation,
  upsertTranslation,
  getChapterById,
  updateChapterImages,
} from "../db/repositories.js";
import { getSourceAdapter } from "../scraper/registry.js";
import { config } from "../config.js";
import type { TranslationProgress, TierStats } from "./types.js";

const OCR_CONCURRENCY = 5;
const GEMINI_BATCH_SIZE = 10;
const MODEL_USED = "azure-cv+gemini-2.5-flash";

// Hybrid throttling — fast burst for first pages, then pace to free tier limits
const FAST_START_COUNT = 5;           // images processed at full concurrency
const OCR_THROTTLE_DELAY_MS = 3000;   // 60s / 20 calls = 3s per call (Azure F0 limit)
const GEMINI_BATCH_DELAY_MS = 2000;   // breathing room between Gemini batches

interface OcrImageData {
  index: number;
  url: string;
  blocks: OcrBlock[];
}

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function translateChapter(
  chapterId: number,
  comicSourceId: string,
  sourceName: string,
  onProgress: (progress: TranslationProgress) => void
): Promise<void> {
  const chapter = await getChapterById(chapterId);
  if (!chapter) throw new Error(`Chapter ${chapterId} not found`);

  const adapter = getSourceAdapter(sourceName);

  // Get image URLs - scrape if not cached
  let imageUrls: string[];
  if (chapter.image_urls) {
    imageUrls = JSON.parse(chapter.image_urls) as string[];
  } else {
    const images = await adapter.scrapeChapterImages(
      comicSourceId,
      chapter.source_episode_id
    );
    imageUrls = images.map((img) => img.url);
    await updateChapterImages(chapterId, imageUrls);
  }

  const total = imageUrls.length;
  let completed = 0;

  // Phase 1: check cache
  const cachedFlags = await Promise.all(imageUrls.map((_, i) => getTranslation(chapterId, i)));
  const uncached: { index: number; url: string }[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    if (cachedFlags[i]) {
      completed++;
    } else {
      uncached.push({ index: i, url: imageUrls[i] });
    }
  }

  const tierStats: TierStats = { ocrFree: 0, ocrPaid: 0, geminiFree: 0, geminiPaid: 0 };

  onProgress({ chapterId, total, completed, status: "translating", tierStats });
  if (uncached.length === 0) {
    onProgress({ chapterId, total, completed: total, status: "done", tierStats });
    return;
  }

  let hasError = false;
  const limit = pLimit(OCR_CONCURRENCY);

  // Helper: run OCR on a single image, returns result or null (no text)
  async function processOcrImage(index: number, url: string): Promise<OcrImageData | null> {
    const { blocks, tier } = await ocrImage(url, adapter.referer);
    if (tier === "free") tierStats.ocrFree++;
    else tierStats.ocrPaid++;

    if (blocks.length === 0) {
      await upsertTranslation({
        chapterId,
        imageIndex: index,
        originalUrl: url,
        targetLang: "pt-BR",
        overlayData: "[]",
        modelUsed: MODEL_USED,
      });
      completed++;
      onProgress({ chapterId, total, completed, status: "translating", tierStats });
      return null;
    }
    return { index, url, blocks };
  }

  // Helper: translate a batch of OCR results with Gemini and save to DB
  async function translateBatch(batch: OcrImageData[]): Promise<void> {
    const imageBlocks = new Map<number, OcrBlock[]>();
    const urlMap = new Map<number, string>();
    for (const { index, url, blocks } of batch) {
      imageBlocks.set(index, blocks);
      urlMap.set(index, url);
    }

    const { translations: results, tier } = await translateBlocksBatch(imageBlocks);
    if (tier === "free") tierStats.geminiFree++;
    else tierStats.geminiPaid++;

    for (const { index } of batch) {
      const entries = results.get(index) ?? [];
      const originalTexts = entries.map((e) => e.original).join("\n");
      const translatedTexts = entries.map((e) => e.translated).join("\n");

      await upsertTranslation({
        chapterId,
        imageIndex: index,
        originalUrl: urlMap.get(index)!,
        originalText: originalTexts || undefined,
        translatedText: translatedTexts || undefined,
        targetLang: "pt-BR",
        overlayData: JSON.stringify(entries),
        modelUsed: MODEL_USED,
      });
    }

    completed += batch.length;
    onProgress({ chapterId, total, completed, status: "translating", tierStats });
  }

  // Split into fast burst + throttled phases
  const fastImages = uncached.slice(0, FAST_START_COUNT);
  const throttledImages = uncached.slice(FAST_START_COUNT);

  // ── Stage 1: Fast OCR — first N images at full concurrency ──
  const fastOcrResults: OcrImageData[] = [];
  if (fastImages.length > 0) {
    console.log(
      `[translate] Fast phase: OCR ${fastImages.length} images (concurrency ${OCR_CONCURRENCY})`
    );
    await Promise.all(
      fastImages.map(({ index, url }) =>
        limit(async () => {
          if (hasError) return;
          try {
            const result = await processOcrImage(index, url);
            if (result) fastOcrResults.push(result);
          } catch (error) {
            hasError = true;
            onProgress({
              chapterId, total, completed, status: "error",
              error: error instanceof Error ? error.message : "OCR failed",
              tierStats,
            });
          }
        })
      )
    );
  }
  if (hasError) return;

  // ── Stage 2: Translate fast batch immediately — user sees results quickly ──
  if (fastOcrResults.length > 0) {
    console.log(`[translate] Translating fast batch: ${fastOcrResults.length} images`);
    try {
      await translateBatch(fastOcrResults);
    } catch (error) {
      hasError = true;
      onProgress({
        chapterId, total, completed, status: "error",
        error: error instanceof Error ? error.message : "Translation failed",
        tierStats,
      });
    }
  }
  if (hasError) return;

  // ── Stage 3: Throttled OCR with interleaved Gemini translation ──
  if (throttledImages.length > 0) {
    const pendingOcr: OcrImageData[] = [];

    if (config.hasFreeTierAzure) {
      console.log(
        `[translate] Throttled phase: OCR ${throttledImages.length} images (${OCR_THROTTLE_DELAY_MS}ms interval)`
      );
      for (const { index, url } of throttledImages) {
        if (hasError) break;
        const t0 = Date.now();
        try {
          const result = await processOcrImage(index, url);
          if (result) pendingOcr.push(result);
        } catch (error) {
          hasError = true;
          onProgress({
            chapterId, total, completed, status: "error",
            error: error instanceof Error ? error.message : "OCR failed",
            tierStats,
          });
          break;
        }

        // When we have a full batch, translate immediately
        if (pendingOcr.length >= GEMINI_BATCH_SIZE) {
          const batch = pendingOcr.splice(0, GEMINI_BATCH_SIZE);
          console.log(`[translate] Translating throttled batch: ${batch.length} images`);
          try {
            await translateBatch(batch);
          } catch (error) {
            hasError = true;
            onProgress({
              chapterId, total, completed, status: "error",
              error: error instanceof Error ? error.message : "Translation failed",
              tierStats,
            });
            break;
          }
          // Gemini call took time — skip throttle delay this iteration
          continue;
        }

        // Throttle: wait remaining time to match target interval
        const wait = OCR_THROTTLE_DELAY_MS - (Date.now() - t0);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    } else {
      // No free tier keys — run all remaining OCR at full speed
      console.log(
        `[translate] OCR remaining ${throttledImages.length} images (concurrency ${OCR_CONCURRENCY})`
      );
      await Promise.all(
        throttledImages.map(({ index, url }) =>
          limit(async () => {
            if (hasError) return;
            try {
              const result = await processOcrImage(index, url);
              if (result) pendingOcr.push(result);
            } catch (error) {
              hasError = true;
              onProgress({
                chapterId, total, completed, status: "error",
                error: error instanceof Error ? error.message : "OCR failed",
                tierStats,
              });
            }
          })
        )
      );
    }

    if (hasError) return;

    // Translate any remaining OCR results
    if (pendingOcr.length > 0) {
      const remainingBatches = chunk(pendingOcr, GEMINI_BATCH_SIZE);
      for (let i = 0; i < remainingBatches.length; i++) {
        if (hasError) break;
        console.log(`[translate] Translating remaining batch: ${remainingBatches[i].length} images`);
        try {
          await translateBatch(remainingBatches[i]);
        } catch (error) {
          hasError = true;
          onProgress({
            chapterId, total, completed, status: "error",
            error: error instanceof Error ? error.message : "Translation failed",
            tierStats,
          });
        }
        if (config.hasFreeTierGemini && i < remainingBatches.length - 1) {
          await new Promise((r) => setTimeout(r, GEMINI_BATCH_DELAY_MS));
        }
      }
    }
  }

  if (!hasError) {
    onProgress({ chapterId, total, completed: total, status: "done", tierStats });
  }
}
