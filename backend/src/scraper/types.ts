export interface ComicDetail {
  csid: string;
  title: string;
  author: string;
  coverUrl: string;
  totalEpisodes: number;
  serialStatus: string;
  tags: string[];
  episodes: EpisodeInfo[];
}

export interface EpisodeInfo {
  esid: string;
  title: string;
  episodeNumber: number;
  isFree: boolean;
}

export interface ChapterImage {
  url: string;
  width: number;
  height: number;
  index: number;
}
