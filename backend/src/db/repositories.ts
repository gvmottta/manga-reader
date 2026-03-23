import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "./database.js";

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

function translationSk(targetLang: string, imageIndex: number): string {
  return `${targetLang}#${String(imageIndex).padStart(4, "0")}`;
}

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

// ── Comics ──────────────────────────────────────────────────────────────────

export async function getComicBySource(source: string, sourceId: string): Promise<ComicRow | undefined> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.comics,
    IndexName: "SourceIndex",
    KeyConditionExpression: "#src = :source AND source_id = :sourceId",
    ExpressionAttributeNames: { "#src": "source" },
    ExpressionAttributeValues: { ":source": source, ":sourceId": sourceId },
  }));
  return result.Items?.[0] as ComicRow | undefined;
}

export async function upsertComic(data: {
  source: string;
  sourceId: string;
  title: string;
  author?: string;
  coverUrl?: string;
  totalChapters?: number;
  serialStatus?: string;
}): Promise<ComicRow> {
  const existing = await getComicBySource(data.source, data.sourceId);
  const now = new Date().toISOString();

  if (existing) {
    const updated: ComicRow = {
      ...existing,
      title: data.title,
      author: data.author ?? null,
      cover_url: data.coverUrl ?? null,
      total_chapters: data.totalChapters ?? null,
      serial_status: data.serialStatus ?? null,
      updated_at: now,
    };
    await docClient.send(new UpdateCommand({
      TableName: TABLES.comics,
      Key: { id: existing.id },
      UpdateExpression: "SET title = :title, author = :author, cover_url = :coverUrl, total_chapters = :totalChapters, serial_status = :serialStatus, updated_at = :updatedAt",
      ExpressionAttributeValues: {
        ":title": data.title,
        ":author": data.author ?? null,
        ":coverUrl": data.coverUrl ?? null,
        ":totalChapters": data.totalChapters ?? null,
        ":serialStatus": data.serialStatus ?? null,
        ":updatedAt": now,
      },
    }));
    return updated;
  }

  const item: ComicRow = {
    id: Date.now(),
    source: data.source,
    source_id: data.sourceId,
    title: data.title,
    author: data.author ?? null,
    cover_url: data.coverUrl ?? null,
    total_chapters: data.totalChapters ?? null,
    serial_status: data.serialStatus ?? null,
    created_at: now,
    updated_at: now,
  };
  await docClient.send(new PutCommand({ TableName: TABLES.comics, Item: item }));
  return item;
}

export async function getComicById(id: number): Promise<ComicRow | undefined> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.comics,
    Key: { id },
  }));
  return result.Item as ComicRow | undefined;
}

export async function getAllComics(): Promise<ComicRow[]> {
  const result = await docClient.send(new ScanCommand({ TableName: TABLES.comics }));
  const items = (result.Items ?? []) as ComicRow[];
  return items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

// ── Chapters ─────────────────────────────────────────────────────────────────

export async function upsertChapter(data: {
  comicId: number;
  sourceEpisodeId: string;
  title?: string;
  chapterNumber?: number;
  isFree: boolean;
}): Promise<ChapterRow> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.chapters,
    IndexName: "ComicIndex",
    KeyConditionExpression: "comic_id = :comicId AND source_episode_id = :sourceEpisodeId",
    ExpressionAttributeValues: {
      ":comicId": data.comicId,
      ":sourceEpisodeId": data.sourceEpisodeId,
    },
  }));

  const now = new Date().toISOString();

  if (result.Items && result.Items.length > 0) {
    const existing = result.Items[0] as ChapterRow;
    const updated: ChapterRow = {
      ...existing,
      title: data.title ?? null,
      chapter_number: data.chapterNumber ?? null,
      is_free: data.isFree ? 1 : 0,
      updated_at: now,
    };
    await docClient.send(new UpdateCommand({
      TableName: TABLES.chapters,
      Key: { id: existing.id },
      UpdateExpression: "SET title = :title, chapter_number = :chapterNumber, is_free = :isFree, updated_at = :updatedAt",
      ExpressionAttributeValues: {
        ":title": data.title ?? null,
        ":chapterNumber": data.chapterNumber ?? null,
        ":isFree": data.isFree ? 1 : 0,
        ":updatedAt": now,
      },
    }));
    return updated;
  }

  const item: ChapterRow = {
    id: Date.now(),
    comic_id: data.comicId,
    source_episode_id: data.sourceEpisodeId,
    title: data.title ?? null,
    chapter_number: data.chapterNumber ?? null,
    is_free: data.isFree ? 1 : 0,
    image_urls: null,
    created_at: now,
    updated_at: now,
  };
  await docClient.send(new PutCommand({ TableName: TABLES.chapters, Item: item }));
  return item;
}

export async function getChaptersByComic(comicId: number): Promise<ChapterRow[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.chapters,
    IndexName: "ComicIndex",
    KeyConditionExpression: "comic_id = :comicId",
    ExpressionAttributeValues: { ":comicId": comicId },
  }));
  const items = (result.Items ?? []) as ChapterRow[];
  return items.sort((a, b) => (a.chapter_number ?? 0) - (b.chapter_number ?? 0));
}

export async function getTranslationCountsByComic(comicId: number): Promise<{ chapter_id: number; translated_count: number }[]> {
  const chapters = await getChaptersByComic(comicId);
  return Promise.all(
    chapters.map(async (ch) => {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLES.translations,
        KeyConditionExpression: "chapter_id = :chapterId AND begins_with(sk, :lang)",
        ExpressionAttributeValues: {
          ":chapterId": ch.id,
          ":lang": "pt-BR#",
        },
        Select: "COUNT",
      }));
      return { chapter_id: ch.id, translated_count: result.Count ?? 0 };
    })
  );
}

export async function getChapterById(id: number): Promise<ChapterRow | undefined> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.chapters,
    Key: { id },
  }));
  return result.Item as ChapterRow | undefined;
}

export async function updateChapterImages(chapterId: number, imageUrls: string[]): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: TABLES.chapters,
    Key: { id: chapterId },
    UpdateExpression: "SET image_urls = :imageUrls, updated_at = :updatedAt",
    ExpressionAttributeValues: {
      ":imageUrls": JSON.stringify(imageUrls),
      ":updatedAt": new Date().toISOString(),
    },
  }));
}

// ── Translations ──────────────────────────────────────────────────────────────

export async function upsertTranslation(data: {
  chapterId: number;
  imageIndex: number;
  originalUrl: string;
  originalText?: string;
  translatedText?: string;
  targetLang: string;
  overlayData?: string;
  modelUsed: string;
}): Promise<TranslationRow> {
  const now = new Date().toISOString();
  const row: TranslationRow = {
    id: Date.now(),
    chapter_id: data.chapterId,
    image_index: data.imageIndex,
    original_url: data.originalUrl,
    original_text: data.originalText ?? null,
    translated_text: data.translatedText ?? null,
    target_lang: data.targetLang,
    overlay_data: data.overlayData ?? null,
    model_used: data.modelUsed,
    created_at: now,
  };
  await docClient.send(new PutCommand({
    TableName: TABLES.translations,
    Item: { ...row, sk: translationSk(data.targetLang, data.imageIndex) },
  }));
  return row;
}

export async function getTranslationsByChapter(
  chapterId: number,
  targetLang = "pt-BR"
): Promise<TranslationRow[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.translations,
    KeyConditionExpression: "chapter_id = :chapterId AND begins_with(sk, :lang)",
    ExpressionAttributeValues: {
      ":chapterId": chapterId,
      ":lang": `${targetLang}#`,
    },
  }));
  return (result.Items ?? []) as TranslationRow[];
}

export async function getTranslation(
  chapterId: number,
  imageIndex: number,
  targetLang = "pt-BR"
): Promise<TranslationRow | undefined> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.translations,
    Key: { chapter_id: chapterId, sk: translationSk(targetLang, imageIndex) },
  }));
  return result.Item as TranslationRow | undefined;
}

export async function deleteTranslationsByChapter(chapterId: number): Promise<void> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.translations,
    KeyConditionExpression: "chapter_id = :chapterId",
    ExpressionAttributeValues: { ":chapterId": chapterId },
    ProjectionExpression: "chapter_id, sk",
  }));

  if (!result.Items || result.Items.length === 0) return;

  for (const batch of chunk(result.Items, 25)) {
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [TABLES.translations]: batch.map((item) => ({
          DeleteRequest: { Key: { chapter_id: item.chapter_id, sk: item.sk } },
        })),
      },
    }));
  }
}
