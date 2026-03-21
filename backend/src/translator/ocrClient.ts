import sharp from "sharp";
import { config } from "../config.js";

export interface OcrBlock {
  text: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface AzurePolygonPoint {
  x: number;
  y: number;
}

interface AzureWord {
  text: string;
  boundingPolygon: AzurePolygonPoint[];
}

interface AzureLine {
  text: string;
  boundingPolygon: AzurePolygonPoint[];
  words: AzureWord[];
}

interface AzureBlock {
  lines: AzureLine[];
}

interface AzureReadResult {
  blocks: AzureBlock[];
}

interface AzureResponse {
  readResult?: AzureReadResult;
}

interface WordBox {
  text: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function polygonBbox(
  points: AzurePolygonPoint[]
): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function bboxToPercentage(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  imgWidth: number,
  imgHeight: number,
  paddingFraction = 0.20
): { x: number; y: number; width: number; height: number } {
  const rawX = (minX / imgWidth) * 100;
  const rawY = (minY / imgHeight) * 100;
  const rawW = ((maxX - minX) / imgWidth) * 100;
  const rawH = ((maxY - minY) / imgHeight) * 100;

  const padX = rawW * paddingFraction;
  const padY = rawH * paddingFraction;
  const x = Math.max(0, rawX - padX);
  const y = Math.max(0, rawY - padY);

  return {
    x,
    y,
    width: Math.min(100 - x, rawW + padX * 2),
    height: Math.min(100 - y, rawH + padY * 2),
  };
}

function isLatin(text: string): boolean {
  const asciiChars = (text.match(/[\x20-\x7E]/g) ?? []).length;
  const wordChars = (text.match(/\S/g) ?? []).length;
  return wordChars === 0 || asciiChars / wordChars >= 0.5;
}

/**
 * Clusters words by spatial proximity.
 * Words that are vertically and horizontally close are grouped into one cluster
 * (representing a single speech balloon).
 *
 * Azure CV LINE-level bboxes are unreliable for webtoons (it merges multiple
 * speech bubbles into one huge line). WORD-level bboxes are always accurate.
 */
function clusterWords(
  words: WordBox[],
  vertGapPx: number,
  horizGapPx: number
): WordBox[][] {
  if (words.length === 0) return [];

  const sorted = [...words].sort((a, b) => a.minY - b.minY);
  const clusters: WordBox[][] = [];

  for (const word of sorted) {
    let merged = false;
    for (const cluster of clusters) {
      const clMaxY = Math.max(...cluster.map((w) => w.maxY));
      const clMinX = Math.min(...cluster.map((w) => w.minX));
      const clMaxX = Math.max(...cluster.map((w) => w.maxX));

      const vertClose = word.minY <= clMaxY + vertGapPx;
      const horizClose =
        word.minX <= clMaxX + horizGapPx && word.maxX >= clMinX - horizGapPx;

      if (vertClose && horizClose) {
        cluster.push(word);
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push([word]);
    }
  }

  return clusters;
}

function clusterToText(cluster: WordBox[]): string {
  // Sort by row (minY), then by X within each row
  const ROW_THRESHOLD = 8;
  const sorted = [...cluster].sort((a, b) => a.minY - b.minY);

  const rows: WordBox[][] = [];
  for (const word of sorted) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && word.minY - lastRow[0].minY < ROW_THRESHOLD) {
      lastRow.push(word);
    } else {
      rows.push([word]);
    }
  }

  return rows
    .map((row) => row.sort((a, b) => a.minX - b.minX).map((w) => w.text).join(" "))
    .join(" ");
}

/**
 * Detects overlapping OcrBlocks and shrinks them to eliminate overlap.
 * When two blocks overlap, each is pushed away from the overlap zone
 * proportionally to its size.
 */
function resolveOverlaps(blocks: OcrBlock[]): OcrBlock[] {
  if (blocks.length <= 1) return blocks;

  // Work on a mutable copy of positions
  const positions = blocks.map((b) => ({ ...b.position }));

  // Iterate multiple passes since resolving one pair may affect others
  for (let pass = 0; pass < 3; pass++) {
    let anyOverlap = false;

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];

        // Calculate overlap
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

        if (overlapX <= 0 || overlapY <= 0) continue;
        anyOverlap = true;

        // Resolve along the axis with less overlap (more natural separation)
        if (overlapX < overlapY) {
          // Shrink horizontally
          const halfOverlap = overlapX / 2 + 0.5; // +0.5% gap
          const aCenterX = a.x + a.width / 2;
          const bCenterX = b.x + b.width / 2;
          if (aCenterX <= bCenterX) {
            // a is left, b is right — shrink a's right edge, b's left edge
            a.width = Math.max(a.width - halfOverlap, a.width * 0.5);
            const shrinkB = halfOverlap;
            b.x = Math.min(b.x + shrinkB, b.x + b.width * 0.4);
            b.width = Math.max(b.width - shrinkB, b.width * 0.5);
          } else {
            b.width = Math.max(b.width - halfOverlap, b.width * 0.5);
            const shrinkA = halfOverlap;
            a.x = Math.min(a.x + shrinkA, a.x + a.width * 0.4);
            a.width = Math.max(a.width - shrinkA, a.width * 0.5);
          }
        } else {
          // Shrink vertically
          const halfOverlap = overlapY / 2 + 0.5;
          const aCenterY = a.y + a.height / 2;
          const bCenterY = b.y + b.height / 2;
          if (aCenterY <= bCenterY) {
            // a is above, b is below
            a.height = Math.max(a.height - halfOverlap, a.height * 0.5);
            const shrinkB = halfOverlap;
            b.y = Math.min(b.y + shrinkB, b.y + b.height * 0.4);
            b.height = Math.max(b.height - shrinkB, b.height * 0.5);
          } else {
            b.height = Math.max(b.height - halfOverlap, b.height * 0.5);
            const shrinkA = halfOverlap;
            a.y = Math.min(a.y + shrinkA, a.y + a.height * 0.4);
            a.height = Math.max(a.height - shrinkA, a.height * 0.5);
          }
        }
      }
    }

    if (!anyOverlap) break;
  }

  return blocks.map((b, i) => ({
    ...b,
    position: positions[i],
  }));
}

export async function ocrImage(imageUrl: string): Promise<OcrBlock[]> {
  console.log(`[ocr] Fetching image: ${imageUrl}`);
  const imageResponse = await fetch(imageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://qtoon.com/",
    },
  });
  if (!imageResponse.ok) {
    throw new Error(
      `Failed to fetch image: ${imageResponse.status} ${imageUrl}`
    );
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  const { data: resized, info } = await sharp(imageBuffer)
    .resize(768, undefined, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  console.log(`[ocr] Image resized to ${info.width}x${info.height}px`);

  const endpoint = config.azureVisionEndpoint.replace(/\/$/, "");
  const url = `${endpoint}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": config.azureVisionKey,
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(resized),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure CV error ${response.status}: ${errText}`);
  }

  const result = (await response.json()) as AzureResponse;

    // Extract word-level bboxes (accurate) — LINE-level bboxes are unreliable
    // because Azure CV merges multiple speech bubbles into one huge line for webtoons.
    const allWords: WordBox[] = [];
    for (const block of result.readResult?.blocks ?? []) {
      for (const line of block.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text.trim();
          if (!text || !isLatin(text)) continue;

          const points = word.boundingPolygon ?? [];
          if (points.length === 0) continue;

          const { minX, minY, maxX, maxY } = polygonBbox(points);
          if (maxX <= minX || maxY <= minY) continue;

          allWords.push({ text, minX, minY, maxX, maxY });
        }
      }
    }

    // Cluster by proximity: ~3% of image height vertical gap, ~6% width horizontal gap
    const vertGapPx = Math.round(info.height * 0.03);
    const horizGapPx = Math.round(info.width * 0.06);
    const wordClusters = clusterWords(allWords, vertGapPx, horizGapPx);

    const blocks: OcrBlock[] = [];
    for (const cluster of wordClusters) {
      const text = clusterToText(cluster);
      if (!text) continue;

      const minX = Math.min(...cluster.map((w) => w.minX));
      const minY = Math.min(...cluster.map((w) => w.minY));
      const maxX = Math.max(...cluster.map((w) => w.maxX));
      const maxY = Math.max(...cluster.map((w) => w.maxY));

      const position = bboxToPercentage(minX, minY, maxX, maxY, info.width, info.height);
      if (position.width <= 0 || position.height <= 0) continue;

      blocks.push({ text, position });
    }

    const resolved = resolveOverlaps(blocks);
    console.log(
      `[ocr] Extracted ${resolved.length} clusters from ${allWords.length} words`
    );
    return resolved;
}
