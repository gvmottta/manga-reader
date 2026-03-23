import type { ComicDetail, ChapterImage } from "./types.js";

export interface SourceAdapter {
  /** Unique key stored in DB `comics.source` column, e.g. "qtoon" */
  readonly name: string;

  /** Hostnames this source's images come from. Used by the proxy whitelist. */
  readonly allowedHostnames: string[];

  /** Referer header to send when fetching images from this source's CDN. */
  readonly referer: string;

  /**
   * Try to parse user input (URL or bare ID) into a source-specific ID.
   * Return the ID string if this source can handle it, or `null` if not.
   */
  parseUrl(input: string): string | null;

  /** Scrape comic metadata and episode list from the source. */
  scrapeComicDetail(sourceId: string): Promise<ComicDetail>;

  /** Scrape chapter image URLs from the source. */
  scrapeChapterImages(
    comicSourceId: string,
    episodeSourceId: string
  ): Promise<ChapterImage[]>;
}
