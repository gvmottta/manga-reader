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
import { scrapeChapterImages } from "../scraper/qtoonScraper.js";
import type { TranslationProgress } from "./types.js";

const OCR_CONCURRENCY = 10;
const GEMINI_BATCH_SIZE = 10;
const MODEL_USED = "azure-cv+gemini-2.5-flash";

interface OcrResult {
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
  onProgress: (progress: TranslationProgress) => void
): Promise<void> {
  const chapter = getChapterById(chapterId);
  if (!chapter) throw new Error(`Chapter ${chapterId} not found`);

  // Get image URLs - scrape if not cached
  let imageUrls: string[];
  if (chapter.image_urls) {
    imageUrls = JSON.parse(chapter.image_urls) as string[];
  } else {
    const images = await scrapeChapterImages(
      comicSourceId,
      chapter.source_episode_id
    );
    imageUrls = images.map((img) => img.url);
    updateChapterImages(chapterId, imageUrls);
  }

  const total = imageUrls.length;
  let completed = 0;

  // Phase 1: check cache
  const uncached: { index: number; url: string }[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    if (getTranslation(chapterId, i)) {
      completed++;
    } else {
      uncached.push({ index: i, url: imageUrls[i] });
    }
  }

  onProgress({ chapterId, total, completed, status: "translating" });
  if (uncached.length === 0) {
    onProgress({ chapterId, total, completed: total, status: "done" });
    return;
  }

  // Phase 2a: OCR all uncached images in parallel
  const limit = pLimit(OCR_CONCURRENCY);
  const ocrResults: OcrResult[] = [];
  let hasError = false;

  console.log(
    `[translate] Phase 2a: OCR ${uncached.length} images (concurrency ${OCR_CONCURRENCY})`
  );

  await Promise.all(
    uncached.map(({ index, url }) =>
      limit(async () => {
        if (hasError) return;
        try {
          const blocks = await ocrImage(url);
          if (blocks.length === 0) {
            // No text found — save empty overlay immediately
            upsertTranslation({
              chapterId,
              imageIndex: index,
              originalUrl: url,
              targetLang: "pt-BR",
              overlayData: "[]",
              modelUsed: MODEL_USED,
            });
            completed++;
            onProgress({ chapterId, total, completed, status: "translating" });
          } else {
            ocrResults.push({ index, url, blocks });
          }
        } catch (error) {
          hasError = true;
          onProgress({
            chapterId,
            total,
            completed,
            status: "error",
            error:
              error instanceof Error ? error.message : "OCR failed",
          });
        }
      })
    )
  );

  if (hasError) return;

  // Phase 2b: Batch translate with Gemini
  const batches = chunk(ocrResults, GEMINI_BATCH_SIZE);
  console.log(
    `[translate] Phase 2b: ${ocrResults.length} images with text → ${batches.length} Gemini batches`
  );

  for (const batch of batches) {
    if (hasError) break;

    try {
      const imageBlocks = new Map<number, OcrBlock[]>();
      const urlMap = new Map<number, string>();
      for (const { index, url, blocks } of batch) {
        imageBlocks.set(index, blocks);
        urlMap.set(index, url);
      }

      const results = await translateBlocksBatch(imageBlocks);

      // Save each image's results
      for (const { index } of batch) {
        const entries = results.get(index) ?? [];
        const originalTexts = entries.map((e) => e.original).join("\n");
        const translatedTexts = entries.map((e) => e.translated).join("\n");

        upsertTranslation({
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
      onProgress({ chapterId, total, completed, status: "translating" });
    } catch (error) {
      hasError = true;
      onProgress({
        chapterId,
        total,
        completed,
        status: "error",
        error:
          error instanceof Error ? error.message : "Translation failed",
      });
    }
  }

  if (!hasError) {
    onProgress({ chapterId, total, completed: total, status: "done" });
  }
}
