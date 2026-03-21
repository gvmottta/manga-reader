import pLimit from "p-limit";
import { ocrImage } from "./ocrClient.js";
import { translateBlocks } from "./geminiTextClient.js";
import {
  getTranslation,
  upsertTranslation,
  getChapterById,
  updateChapterImages,
} from "../db/repositories.js";
import { scrapeChapterImages } from "../scraper/qtoonScraper.js";
import type { TranslationProgress } from "./types.js";

const CONCURRENCY = 3; // Azure CV F0: 20 calls/min — 3 parallel × ~4s/call ≈ safe

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
  const limit = pLimit(CONCURRENCY);

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

  // Phase 2: translate uncached images in parallel
  let hasError = false;

  await Promise.all(
    uncached.map(({ index, url }) =>
      limit(async () => {
        if (hasError) return;

        try {
          const ocrBlocks = await ocrImage(url);
          const entries = await translateBlocks(ocrBlocks);

          const originalTexts = entries.map((e) => e.original).join("\n");
          const translatedTexts = entries.map((e) => e.translated).join("\n");

          upsertTranslation({
            chapterId,
            imageIndex: index,
            originalUrl: url,
            originalText: originalTexts || undefined,
            translatedText: translatedTexts || undefined,
            targetLang: "pt-BR",
            overlayData: JSON.stringify(entries),
            modelUsed: "azure-cv+gemini-2.5-flash-lite",
          });

          completed++;
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
      })
    )
  );

  if (!hasError) {
    onProgress({ chapterId, total, completed: total, status: "done" });
  }
}
