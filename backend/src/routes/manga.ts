import { Router } from "express";
import { resolveInput, getSourceAdapter } from "../scraper/registry.js";
import {
  upsertComic,
  upsertChapter,
  getChaptersByComic,
  getChapterById,
  getComicById,
  getAllComics,
  getTranslationsByChapter,
  getTranslationCountsByComic,
  updateChapterImages,
  deleteTranslationsByChapter,
} from "../db/repositories.js";
import { translateChapter } from "../translator/translationService.js";
import {
  getJobProgress,
  setJobProgress,
} from "../services/translationJobs.js";

export const mangaRouter = Router();

// GET /api/manga - List all comics
mangaRouter.get("/", async (_req, res, next) => {
  try {
    const comics = await getAllComics();
    res.json({ comics });
  } catch (err) {
    next(err);
  }
});

// POST /api/manga/load - Parse URL, scrape, upsert DB, return comic + chapters
mangaRouter.post("/load", async (req, res, next) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url) {
      res.status(400).json({ error: "Missing url field" });
      return;
    }

    let adapter, sourceId;
    try {
      ({ adapter, sourceId } = resolveInput(url));
    } catch {
      res.status(400).json({ error: "Unrecognized manga URL or ID" });
      return;
    }

    const detail = await adapter.scrapeComicDetail(sourceId);

    const comic = await upsertComic({
      source: adapter.name,
      sourceId: detail.sourceId,
      title: detail.title,
      author: detail.author,
      coverUrl: detail.coverUrl,
      totalChapters: detail.totalEpisodes,
      serialStatus: detail.serialStatus,
    });

    const chapters = await Promise.all(
      detail.episodes.map((ep) =>
        upsertChapter({
          comicId: comic.id,
          sourceEpisodeId: ep.sourceEpisodeId,
          title: ep.title,
          chapterNumber: ep.episodeNumber,
          isFree: ep.isFree,
        })
      )
    );

    res.json({ comic, chapters });
  } catch (err) {
    next(err);
  }
});

// GET /api/manga/:comicId/chapters
mangaRouter.get("/:comicId/chapters", async (req, res, next) => {
  try {
    const comicId = parseInt(req.params.comicId, 10);
    if (isNaN(comicId)) {
      res.status(400).json({ error: "Invalid comic ID" });
      return;
    }

    const comic = await getComicById(comicId);
    if (!comic) {
      res.status(404).json({ error: "Comic not found" });
      return;
    }

    const [chapters, translationCounts] = await Promise.all([
      getChaptersByComic(comicId),
      getTranslationCountsByComic(comicId),
    ]);
    const countMap = new Map(translationCounts.map(r => [r.chapter_id, r.translated_count]));

    const enrichedChapters = chapters.map(ch => {
      const totalImages = ch.image_urls ? (JSON.parse(ch.image_urls) as string[]).length : 0;
      const translatedCount = countMap.get(ch.id) ?? 0;
      const translation_status =
        totalImages > 0 && translatedCount >= totalImages ? "complete" as const
        : translatedCount > 0 ? "partial" as const
        : "none" as const;
      return { ...ch, translation_status };
    });

    res.json({ comic, chapters: enrichedChapters });
  } catch (err) {
    next(err);
  }
});

// POST /api/manga/:comicId/chapters/:chapterId/translate
mangaRouter.post(
  "/:comicId/chapters/:chapterId/translate",
  async (req, res, next) => {
    try {
      const comicId = parseInt(req.params.comicId, 10);
      const chapterId = parseInt(req.params.chapterId, 10);
      if (isNaN(comicId) || isNaN(chapterId)) {
        res.status(400).json({ error: "Invalid IDs" });
        return;
      }

      const [comic, chapter] = await Promise.all([
        getComicById(comicId),
        getChapterById(chapterId),
      ]);

      if (!comic) {
        res.status(404).json({ error: "Comic not found" });
        return;
      }

      if (!chapter || chapter.comic_id !== comicId) {
        res.status(404).json({ error: "Chapter not found" });
        return;
      }

      // Force retry: delete cached translations and reset job state
      if (req.query.force === "true") {
        await deleteTranslationsByChapter(chapterId);
      }

      // Check if already translating, pending, or done (in-memory job state)
      const existing = getJobProgress(chapterId);
      if (!req.query.force && existing && (existing.status === "translating" || existing.status === "pending" || existing.status === "done")) {
        console.log(`[translate] Chapter ${chapterId}: skipped (job already ${existing.status})`);
        res.json({ message: existing.status === "done" ? "Translation already cached" : "Translation already in progress", progress: existing });
        return;
      }

      // Check if fully cached in DB (covers server restart where job map is empty)
      const translations = await getTranslationsByChapter(chapterId);
      if (chapter.image_urls) {
        const imageUrls = JSON.parse(chapter.image_urls) as string[];
        if (translations.length >= imageUrls.length) {
          console.log(`[translate] Chapter ${chapterId}: fully cached in DB (${translations.length}/${imageUrls.length})`);
          setJobProgress(chapterId, {
            chapterId,
            total: imageUrls.length,
            completed: imageUrls.length,
            status: "done",
          });
          res.json({ message: "Translation already cached", progress: getJobProgress(chapterId) });
          return;
        }
      }

      // Start translation in background
      console.log(`[translate] Chapter ${chapterId}: starting new translation`);
      setJobProgress(chapterId, {
        chapterId,
        total: 0,
        completed: 0,
        status: "pending",
      });

      if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
        // On Lambda: invoke self asynchronously so translation runs in its own execution
        const { LambdaClient, InvokeCommand } = await import("@aws-sdk/client-lambda");
        const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION ?? "us-east-1" });
        await lambdaClient.send(new InvokeCommand({
          FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
          InvocationType: "Event",
          Payload: Buffer.from(JSON.stringify({
            __translateJob: true,
            chapterId,
            comicSourceId: comic.source_id,
            sourceName: comic.source,
          })),
        }));
      } else {
        // Local / EC2: fire and forget in-process
        translateChapter(chapterId, comic.source_id, comic.source, (progress) => {
          setJobProgress(chapterId, progress);
        }).catch((error) => {
          setJobProgress(chapterId, {
            chapterId,
            total: 0,
            completed: 0,
            status: "error",
            error:
              error instanceof Error ? error.message : "Translation failed",
          });
        });
      }

      res.json({ message: "Translation started", progress: getJobProgress(chapterId) });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/manga/:comicId/chapters/:chapterId/status
mangaRouter.get(
  "/:comicId/chapters/:chapterId/status",
  (req, res, next) => {
    try {
      const chapterId = parseInt(req.params.chapterId, 10);
      if (isNaN(chapterId)) {
        res.status(400).json({ error: "Invalid chapter ID" });
        return;
      }

      const progress = getJobProgress(chapterId);
      if (!progress) {
        res.json({
          chapterId,
          total: 0,
          completed: 0,
          status: "pending",
        });
        return;
      }

      res.json(progress);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/manga/:comicId/chapters/:chapterId/images
mangaRouter.get(
  "/:comicId/chapters/:chapterId/images",
  async (req, res, next) => {
    try {
      const comicId = parseInt(req.params.comicId, 10);
      const chapterId = parseInt(req.params.chapterId, 10);
      if (isNaN(comicId) || isNaN(chapterId)) {
        res.status(400).json({ error: "Invalid IDs" });
        return;
      }

      const [comic, chapter] = await Promise.all([
        getComicById(comicId),
        getChapterById(chapterId),
      ]);

      if (!comic) {
        res.status(404).json({ error: "Comic not found" });
        return;
      }

      if (!chapter || chapter.comic_id !== comicId) {
        res.status(404).json({ error: "Chapter not found" });
        return;
      }

      // Scrape images if not cached (or ?refresh=true to force re-scrape)
      let imageUrls: string[];
      const forceRefresh = req.query.refresh === "true";
      if (chapter.image_urls && !forceRefresh) {
        imageUrls = JSON.parse(chapter.image_urls) as string[];
      } else {
        const sourceAdapter = getSourceAdapter(comic.source);
        const images = await sourceAdapter.scrapeChapterImages(
          comic.source_id,
          chapter.source_episode_id
        );
        imageUrls = images.map((img) => img.url);
        await updateChapterImages(chapterId, imageUrls);
      }

      const translations = await getTranslationsByChapter(chapterId);
      const translationMap = new Map(
        translations.map((t) => [t.image_index, t])
      );

      const result = imageUrls.map((url, index) => {
        const translation = translationMap.get(index);
        return {
          index,
          url,
          proxyUrl: `/api/proxy/image?url=${encodeURIComponent(url)}`,
          translation: translation
            ? {
                overlayData: translation.overlay_data
                  ? JSON.parse(translation.overlay_data)
                  : [],
                originalText: translation.original_text,
                translatedText: translation.translated_text,
              }
            : null,
        };
      });

      res.json({ images: result });
    } catch (err) {
      next(err);
    }
  }
);
