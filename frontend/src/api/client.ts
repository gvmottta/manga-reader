export interface Comic {
  id: number;
  source: string;
  source_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  total_chapters: number | null;
  serial_status: string | null;
}

export interface Chapter {
  id: number;
  comic_id: number;
  source_episode_id: string;
  title: string | null;
  chapter_number: number | null;
  is_free: number;
  image_urls: string | null;
}

export interface TranslationProgress {
  chapterId: number;
  total: number;
  completed: number;
  status: "pending" | "translating" | "done" | "error";
  error?: string;
}

export interface TranslationEntry {
  original: string;
  translated: string;
  position: { x: number; y: number; width: number; height: number };
  type: "bubble" | "sfx" | "narration";
  shape?: "ellipse" | "rectangle" | "cloud";
}

export interface ChapterImage {
  index: number;
  url: string;
  proxyUrl: string;
  translation: {
    overlayData: TranslationEntry[];
    originalText: string | null;
    translatedText: string | null;
  } | null;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export async function listComics(): Promise<{ comics: Comic[] }> {
  return apiFetch("/api/manga");
}

export async function loadManga(
  url: string
): Promise<{ comic: Comic; chapters: Chapter[] }> {
  return apiFetch("/api/manga/load", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export async function getChapters(
  comicId: number
): Promise<{ comic: Comic; chapters: Chapter[] }> {
  return apiFetch(`/api/manga/${comicId}/chapters`);
}

export async function startTranslation(
  comicId: number,
  chapterId: number
): Promise<{ message: string; progress: TranslationProgress }> {
  return apiFetch(`/api/manga/${comicId}/chapters/${chapterId}/translate`, {
    method: "POST",
  });
}

export async function getTranslationStatus(
  comicId: number,
  chapterId: number
): Promise<TranslationProgress> {
  return apiFetch(`/api/manga/${comicId}/chapters/${chapterId}/status`);
}

export async function getChapterImages(
  comicId: number,
  chapterId: number
): Promise<{ images: ChapterImage[] }> {
  return apiFetch(`/api/manga/${comicId}/chapters/${chapterId}/images`);
}
