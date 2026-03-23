import {
  createHash,
  createDecipheriv,
  createCipheriv,
  randomUUID,
} from "crypto";
import { extractNuxtData, findInNuxtData } from "../nuxtExtractor.js";
import type { SourceAdapter } from "../sourceAdapter.js";
import type { ComicDetail, EpisodeInfo, ChapterImage } from "../types.js";

const BASE_URL = "https://qtoon.com";
const API_BASE = "https://api.qtoon.com";
const AES_KEY = "OQlM9JBJgLWsgffb";
const URL_SALT = "9tv86uBwmOYs7QZ0";
const DEVICE_ID = "manga_reader_" + randomUUID().slice(0, 8);
const FETCH_DELAY_MS = 500;

function md5(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

function aesDecrypt(key: string, iv: string, data: string): string {
  const decipher = createDecipheriv(
    "aes-128-cbc",
    Buffer.from(key),
    Buffer.from(iv)
  );
  return (
    decipher.update(Buffer.from(data, "base64"), undefined, "utf8") +
    decipher.final("utf8")
  );
}

function aesEncrypt(key: string, iv: string, data: string): string {
  const cipher = createCipheriv(
    "aes-128-cbc",
    Buffer.from(key),
    Buffer.from(iv)
  );
  return cipher.update(data, "utf8", "base64") + cipher.final("base64");
}

function decryptApiResponse(
  ts: string,
  encData: string
): Record<string, unknown> {
  const h = md5(md5(DEVICE_ID + ts) + AES_KEY);
  const decrypted = aesDecrypt(h.slice(0, 16), h.slice(16), encData);
  return decrypted ? JSON.parse(decrypted) : {};
}

function decryptResourceUrl(encUrl: string): string {
  const h = md5(md5(DEVICE_ID) + URL_SALT);
  const raw = aesDecrypt(h.slice(0, 16), h.slice(16), encUrl);
  const u = new URL(raw);
  u.searchParams.delete("sign");
  u.searchParams.delete("t");
  return u.toString();
}

function makeSign(): string {
  const h = md5(DEVICE_ID);
  return aesEncrypt(h.slice(0, 16), h.slice(16), JSON.stringify({ bl: "" }));
}

async function fetchApi(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE}${endpoint}${query ? "?" + query : ""}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "application/json",
      platform: "h5",
      lth: "en",
      did: DEVICE_ID,
      sign: makeSign(),
      "req-id": randomUUID(),
      "req-ts": Date.now().toString(),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status} fetching ${endpoint}`);
  }

  const json = (await response.json()) as {
    code: number;
    ts: number;
    data: string;
  };
  if (json.code !== 0) {
    throw new Error(`API error code ${json.code} for ${endpoint}`);
  }

  return decryptApiResponse(json.ts.toString(), json.data);
}

async function fetchWithRetry(
  url: string,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (response.ok) return response;

    if (
      (response.status === 429 || response.status >= 500) &&
      attempt < maxRetries - 1
    ) {
      const delay = FETCH_DELAY_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  throw new Error(`Max retries reached for ${url}`);
}

async function scrapeComicDetail(csid: string): Promise<ComicDetail> {
  const url = `${BASE_URL}/detail/${csid}`;
  const response = await fetchWithRetry(url);
  const html = await response.text();
  const nuxt = extractNuxtData(html);

  const comic = findInNuxtData(nuxt, "comic") as
    | Record<string, unknown>
    | undefined;
  if (!comic) {
    throw new Error(`Could not find comic data for ${csid}`);
  }

  const episodes = (findInNuxtData(nuxt, "episodes") as unknown[]) || [];

  const parsedEpisodes: EpisodeInfo[] = episodes.map(
    (ep: unknown, idx: number) => {
      const e = ep as Record<string, unknown>;
      return {
        sourceEpisodeId: String(e.esid || ""),
        title: String(e.title || `Episode ${idx + 1}`),
        episodeNumber: idx + 1,
        isFree: e.coinLock === "none" && e.adLock === "none",
      };
    }
  );

  return {
    sourceId: String(comic.csid || csid),
    title: String(comic.title || "Unknown"),
    author: String(comic.author || "Unknown"),
    coverUrl: String(
      comic.coverUrl ||
        comic.cover ||
        (
          comic.image as
            | Record<string, Record<string, unknown>>
            | undefined
        )?.thumb?.url ||
        ""
    ),
    totalEpisodes: Number(comic.total || parsedEpisodes.length),
    serialStatus: String(comic.serialStatus || "UNKNOWN"),
    tags: Array.isArray(comic.tags)
      ? comic.tags.map((t: unknown) =>
          typeof t === "string"
            ? t
            : String((t as Record<string, unknown>).name || t)
        )
      : [],
    episodes: parsedEpisodes,
  };
}

async function scrapeChapterImages(
  csid: string,
  esid: string
): Promise<ChapterImage[]> {
  console.log(`[scrapeChapterImages] Fetching episode detail for ${esid}`);

  // Step 1: Get the resource token from the episode detail API
  const epDetail = await fetchApi("/api/w/comic/episode/detail", { esid });
  const definitions = epDetail.definitions as
    | Array<{ token: string }>
    | undefined;
  const token = definitions?.[0]?.token;

  if (!token) {
    throw new Error(`No resource token found for episode ${esid}`);
  }

  console.log(`[scrapeChapterImages] Got resource token, fetching images...`);

  // Step 2: Fetch all pages of resources
  type RawResource = {
    rsid: string;
    url: string;
    width: number;
    height: number;
    rgIdx: number;
  };
  const allResources: RawResource[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const data = await fetchApi("/api/w/resource/group/rslv", {
      token,
      page: String(page),
    });
    const resources = (data.resources as RawResource[]) || [];
    allResources.push(...resources);
    hasMore = (data.more as number) === 1;
    page++;
    if (page > 20) break; // safety limit
  }

  console.log(
    `[scrapeChapterImages] Fetched ${allResources.length} resources across ${page - 1} page(s)`
  );

  if (!allResources.length) {
    throw new Error(`No images found for episode ${esid}`);
  }

  // Step 3: Sort by rgIdx and decrypt URLs
  const sorted = allResources.sort((a, b) => a.rgIdx - b.rgIdx);

  const images = sorted.map((r, idx) => ({
    url: decryptResourceUrl(r.url),
    width: r.width || 800,
    height: r.height || 1200,
    index: idx,
  }));

  console.log(
    `[scrapeChapterImages] Mapped ${images.length} images (sorted by rgIdx)`
  );

  return images;
}

export const qtoonAdapter: SourceAdapter = {
  name: "qtoon",
  allowedHostnames: ["resource.qqtoon.com"],
  referer: "https://qtoon.com/",

  parseUrl(input: string): string | null {
    const trimmed = input.trim();

    // Full URL: extract ID from path (handles locale prefixes like /pt/, /es/, etc.)
    if (trimmed.includes("qtoon.com")) {
      const match = trimmed.match(
        /qtoon\.com\/(?:[a-z]{2}\/)?(?:detail|reader)\/([a-zA-Z0-9_]+)/
      );
      return match?.[1] ?? null;
    }

    // Bare ID
    if (/^[a-zA-Z0-9_]+$/.test(trimmed)) return trimmed;

    return null;
  },

  scrapeComicDetail,
  scrapeChapterImages,
};
