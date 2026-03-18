import db from "./database.js";

export interface ComicRow {
  id: number;
  source: string;
  source_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  total_chapters: number | null;
  serial_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterRow {
  id: number;
  comic_id: number;
  source_episode_id: string;
  title: string | null;
  chapter_number: number | null;
  is_free: number;
  image_urls: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranslationRow {
  id: number;
  chapter_id: number;
  image_index: number;
  original_url: string;
  original_text: string | null;
  translated_text: string | null;
  target_lang: string;
  overlay_data: string | null;
  model_used: string;
  created_at: string;
}

// Comics
const upsertComicStmt = db.prepare(`
  INSERT INTO comics (source, source_id, title, author, cover_url, total_chapters, serial_status, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(source, source_id) DO UPDATE SET
    title = excluded.title,
    author = excluded.author,
    cover_url = excluded.cover_url,
    total_chapters = excluded.total_chapters,
    serial_status = excluded.serial_status,
    updated_at = datetime('now')
  RETURNING *
`);

export function upsertComic(data: {
  source: string;
  sourceId: string;
  title: string;
  author?: string;
  coverUrl?: string;
  totalChapters?: number;
  serialStatus?: string;
}): ComicRow {
  return upsertComicStmt.get(
    data.source,
    data.sourceId,
    data.title,
    data.author ?? null,
    data.coverUrl ?? null,
    data.totalChapters ?? null,
    data.serialStatus ?? null
  ) as ComicRow;
}

const getComicByIdStmt = db.prepare("SELECT * FROM comics WHERE id = ?");
export function getComicById(id: number): ComicRow | undefined {
  return getComicByIdStmt.get(id) as ComicRow | undefined;
}

const getAllComicsStmt = db.prepare(
  "SELECT * FROM comics ORDER BY updated_at DESC"
);
export function getAllComics(): ComicRow[] {
  return getAllComicsStmt.all() as ComicRow[];
}

const getComicBySourceStmt = db.prepare(
  "SELECT * FROM comics WHERE source = ? AND source_id = ?"
);
export function getComicBySource(
  source: string,
  sourceId: string
): ComicRow | undefined {
  return getComicBySourceStmt.get(source, sourceId) as ComicRow | undefined;
}

// Chapters
const upsertChapterStmt = db.prepare(`
  INSERT INTO chapters (comic_id, source_episode_id, title, chapter_number, is_free, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(comic_id, source_episode_id) DO UPDATE SET
    title = excluded.title,
    chapter_number = excluded.chapter_number,
    is_free = excluded.is_free,
    updated_at = datetime('now')
  RETURNING *
`);

export function upsertChapter(data: {
  comicId: number;
  sourceEpisodeId: string;
  title?: string;
  chapterNumber?: number;
  isFree: boolean;
}): ChapterRow {
  return upsertChapterStmt.get(
    data.comicId,
    data.sourceEpisodeId,
    data.title ?? null,
    data.chapterNumber ?? null,
    data.isFree ? 1 : 0
  ) as ChapterRow;
}

const getChaptersByComicStmt = db.prepare(
  "SELECT * FROM chapters WHERE comic_id = ? ORDER BY chapter_number ASC"
);
export function getChaptersByComic(comicId: number): ChapterRow[] {
  return getChaptersByComicStmt.all(comicId) as ChapterRow[];
}

const getChapterByIdStmt = db.prepare("SELECT * FROM chapters WHERE id = ?");
export function getChapterById(id: number): ChapterRow | undefined {
  return getChapterByIdStmt.get(id) as ChapterRow | undefined;
}

const updateChapterImagesStmt = db.prepare(
  "UPDATE chapters SET image_urls = ?, updated_at = datetime('now') WHERE id = ?"
);
export function updateChapterImages(
  chapterId: number,
  imageUrls: string[]
): void {
  updateChapterImagesStmt.run(JSON.stringify(imageUrls), chapterId);
}

// Translations
const upsertTranslationStmt = db.prepare(`
  INSERT INTO translations (chapter_id, image_index, original_url, original_text, translated_text, target_lang, overlay_data, model_used)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(chapter_id, image_index, target_lang) DO UPDATE SET
    original_text = excluded.original_text,
    translated_text = excluded.translated_text,
    overlay_data = excluded.overlay_data,
    model_used = excluded.model_used
  RETURNING *
`);

export function upsertTranslation(data: {
  chapterId: number;
  imageIndex: number;
  originalUrl: string;
  originalText?: string;
  translatedText?: string;
  targetLang: string;
  overlayData?: string;
  modelUsed: string;
}): TranslationRow {
  return upsertTranslationStmt.get(
    data.chapterId,
    data.imageIndex,
    data.originalUrl,
    data.originalText ?? null,
    data.translatedText ?? null,
    data.targetLang,
    data.overlayData ?? null,
    data.modelUsed
  ) as TranslationRow;
}

const getTranslationsByChapterStmt = db.prepare(
  "SELECT * FROM translations WHERE chapter_id = ? AND target_lang = ? ORDER BY image_index ASC"
);
export function getTranslationsByChapter(
  chapterId: number,
  targetLang: string = "pt-BR"
): TranslationRow[] {
  return getTranslationsByChapterStmt.all(
    chapterId,
    targetLang
  ) as TranslationRow[];
}

const getTranslationStmt = db.prepare(
  "SELECT * FROM translations WHERE chapter_id = ? AND image_index = ? AND target_lang = ?"
);
export function getTranslation(
  chapterId: number,
  imageIndex: number,
  targetLang: string = "pt-BR"
): TranslationRow | undefined {
  return getTranslationStmt.get(
    chapterId,
    imageIndex,
    targetLang
  ) as TranslationRow | undefined;
}
