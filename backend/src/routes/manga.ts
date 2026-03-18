import { Router } from "express";
import { parseQToonUrl } from "../scraper/urlParser.js";
import {
  scrapeComicDetail,
  scrapeChapterImages,
} from "../scraper/qtoonScraper.js";
import {
  upsertComic,
  upsertChapter,
  getChaptersByComic,
  getChapterById,
  getComicById,
  getAllComics,
  getTranslationsByChapter,
  updateChapterImages,
} from "../db/repositories.js";
import { translateChapter } from "../translator/translationService.js";
import {
  getJobProgress,
  setJobProgress,
} from "../services/translationJobs.js";

export const mangaRouter = Router();

// GET /api/manga - List all comics
mangaRouter.get("/", (_req, res, next) => {
  try {
    const comics = getAllComics();
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

    let csid: string;
    try {
      csid = parseQToonUrl(url);
    } catch {
      res.status(400).json({ error: "Invalid QToon URL or ID" });
      return;
    }

    const detail = await scrapeComicDetail(csid);

    const comic = upsertComic({
      source: "qtoon",
      sourceId: detail.csid,
      title: detail.title,
      author: detail.author,
      coverUrl: detail.coverUrl,
      totalChapters: detail.totalEpisodes,
      serialStatus: detail.serialStatus,
    });

    const chapters = detail.episodes.map((ep) =>
      upsertChapter({
        comicId: comic.id,
        sourceEpisodeId: ep.esid,
        title: ep.title,
        chapterNumber: ep.episodeNumber,
        isFree: ep.isFree,
      })
    );

    res.json({ comic, chapters });
  } catch (err) {
    next(err);
  }
});

// GET /api/manga/:comicId/chapters
mangaRouter.get("/:comicId/chapters", (req, res, next) => {
  try {
    const comicId = parseInt(req.params.comicId, 10);
    if (isNaN(comicId)) {
      res.status(400).json({ error: "Invalid comic ID" });
      return;
    }

    const comic = getComicById(comicId);
    if (!comic) {
      res.status(404).json({ error: "Comic not found" });
      return;
    }

    const chapters = getChaptersByComic(comicId);
    res.json({ comic, chapters });
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

      const comic = getComicById(comicId);
      if (!comic) {
        res.status(404).json({ error: "Comic not found" });
        return;
      }

      const chapter = getChapterById(chapterId);
      if (!chapter || chapter.comic_id !== comicId) {
        res.status(404).json({ error: "Chapter not found" });
        return;
      }

      // Check if already translating or pending
      const existing = getJobProgress(chapterId);
      if (existing && (existing.status === "translating" || existing.status === "pending")) {
        res.json({ message: "Translation already in progress", progress: existing });
        return;
      }

      // Check if fully cached
      const translations = getTranslationsByChapter(chapterId);
      if (chapter.image_urls) {
        const imageUrls = JSON.parse(chapter.image_urls) as string[];
        if (translations.length >= imageUrls.length) {
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
      setJobProgress(chapterId, {
        chapterId,
        total: 0,
        completed: 0,
        status: "pending",
      });

      // Fire and forget
      translateChapter(chapterId, comic.source_id, (progress) => {
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

      const comic = getComicById(comicId);
      if (!comic) {
        res.status(404).json({ error: "Comic not found" });
        return;
      }

      const chapter = getChapterById(chapterId);
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
        const images = await scrapeChapterImages(
          comic.source_id,
          chapter.source_episode_id
        );
        imageUrls = images.map((img) => img.url);
        updateChapterImages(chapterId, imageUrls);
      }

      const translations = getTranslationsByChapter(chapterId);
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
