import type { SourceAdapter } from "../sourceAdapter.js";
import type { ComicDetail, EpisodeInfo, ChapterImage } from "../types.js";

const API_BASE = "https://api.mangadex.org";
const UPLOADS_BASE = "https://uploads.mangadex.org";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface MangaDexResponse<T> {
  result: string;
  data: T;
  limit?: number;
  offset?: number;
  total?: number;
}

interface MangaData {
  id: string;
  attributes: {
    title: Record<string, string>;
    altTitles: Record<string, string>[];
    status: string;
    year: number | null;
    originalLanguage: string;
    tags: { attributes: { name: Record<string, string>; group: string } }[];
  };
  relationships: {
    id: string;
    type: string;
    attributes?: Record<string, unknown>;
  }[];
}

interface ChapterData {
  id: string;
  attributes: {
    volume: string | null;
    chapter: string | null;
    title: string | null;
    translatedLanguage: string;
    pages: number;
  };
}

interface AtHomeResponse {
  result: string;
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

function pickTitle(titles: Record<string, string>, altTitles?: Record<string, string>[]): string {
  if (titles.en) return titles.en;
  if (titles["ja-ro"]) return titles["ja-ro"];
  if (titles["ko-ro"]) return titles["ko-ro"];
  // Try alt titles for English
  if (altTitles) {
    for (const alt of altTitles) {
      if (alt.en) return alt.en;
    }
  }
  // Fallback to first available
  const first = Object.values(titles)[0];
  return first || "Unknown";
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "MangaReader/1.0",
      Accept: "application/json",
    },
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get("x-ratelimit-retry-after");
    const waitMs = retryAfter
      ? Math.max(0, Number(retryAfter) * 1000 - Date.now())
      : 2000;
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchJson(url);
  }

  if (!response.ok) {
    throw new Error(`MangaDex API ${response.status}: ${url}`);
  }

  return response.json() as Promise<T>;
}

async function scrapeComicDetail(mangaId: string): Promise<ComicDetail> {
  // Fetch manga with author + cover_art expanded
  const manga = await fetchJson<MangaDexResponse<MangaData>>(
    `${API_BASE}/manga/${mangaId}?includes[]=author&includes[]=artist&includes[]=cover_art`
  );

  const { attributes, relationships } = manga.data;

  const title = pickTitle(attributes.title, attributes.altTitles);

  const authorRel = relationships.find((r) => r.type === "author");
  const author = authorRel?.attributes?.name
    ? String(authorRel.attributes.name)
    : "Unknown";

  const coverRel = relationships.find((r) => r.type === "cover_art");
  const coverFileName = coverRel?.attributes?.fileName
    ? String(coverRel.attributes.fileName)
    : null;
  const coverUrl = coverFileName
    ? `${UPLOADS_BASE}/covers/${mangaId}/${coverFileName}`
    : "";

  const tags = attributes.tags
    .filter((t) => t.attributes.group === "genre")
    .map((t) => t.attributes.name.en || Object.values(t.attributes.name)[0] || "");

  const statusMap: Record<string, string> = {
    ongoing: "ONGOING",
    completed: "COMPLETED",
    hiatus: "HIATUS",
    cancelled: "CANCELLED",
  };
  const serialStatus = statusMap[attributes.status] || "UNKNOWN";

  // Fetch all chapters (paginated)
  const episodes: EpisodeInfo[] = [];
  let offset = 0;
  const limit = 100;
  let total = Infinity;

  while (offset < total) {
    const params = new URLSearchParams({
      "order[chapter]": "asc",
      limit: String(limit),
      offset: String(offset),
    });

    const feed = await fetchJson<MangaDexResponse<ChapterData[]>>(
      `${API_BASE}/manga/${mangaId}/feed?${params}`
    );

    total = feed.total ?? feed.data.length;

    for (const ch of feed.data) {
      const chNum = ch.attributes.chapter ? parseFloat(ch.attributes.chapter) : null;
      const lang = ch.attributes.translatedLanguage;
      const chTitle = ch.attributes.title
        || (ch.attributes.chapter ? `Chapter ${ch.attributes.chapter}` : `Chapter`);
      const displayTitle = `[${lang}] ${chTitle}`;

      episodes.push({
        sourceEpisodeId: ch.id,
        title: displayTitle,
        episodeNumber: chNum ?? episodes.length + 1,
        isFree: true,
      });
    }

    offset += limit;
  }

  return {
    sourceId: mangaId,
    title,
    author,
    coverUrl,
    totalEpisodes: episodes.length,
    serialStatus,
    tags,
    episodes,
  };
}

async function scrapeChapterImages(
  _mangaId: string,
  chapterId: string
): Promise<ChapterImage[]> {
  const atHome = await fetchJson<AtHomeResponse>(
    `${API_BASE}/at-home/server/${chapterId}`
  );

  const { hash, data } = atHome.chapter;

  return data.map((filename, index) => ({
    url: `${UPLOADS_BASE}/data/${hash}/${filename}`,
    width: 0,
    height: 0,
    index,
  }));
}

export const mangadexAdapter: SourceAdapter = {
  name: "mangadex",
  allowedHostnames: ["uploads.mangadex.org"],
  referer: "https://mangadex.org/",

  parseUrl(input: string): string | null {
    const trimmed = input.trim();

    // Full URL: https://mangadex.org/title/{uuid}/optional-slug
    if (trimmed.includes("mangadex.org")) {
      const match = trimmed.match(
        /mangadex\.org\/title\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/
      );
      return match?.[1] ?? null;
    }

    // Bare UUID
    if (UUID_RE.test(trimmed)) return trimmed;

    return null;
  },

  scrapeComicDetail,
  scrapeChapterImages,
};
