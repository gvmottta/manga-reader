import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import type { TranslationEntry } from "./types.js";
import type { OcrBlock } from "./ocrClient.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const MODEL = "gemini-2.5-flash";

function buildBatchPrompt(imageBlocks: Map<number, OcrBlock[]>): string {
  const sections: string[] = [];
  let totalBlocks = 0;

  for (const [imgIdx, blocks] of imageBlocks) {
    const blockList = blocks.map((b, i) => `[${i}] "${b.text}"`).join("\n");
    sections.push(`=== IMAGE ${imgIdx} ===\n${blockList}`);
    totalBlocks += blocks.length;
  }

  return `You are a manga translator. Below are text blocks extracted by OCR from multiple manga panels, grouped by image.

${sections.join("\n\n")}

For each block in each image, provide a Brazilian Portuguese (pt-BR) translation and classify it.

Rules:
- Translations must be natural and colloquial, appropriate for manga dialogue
- SFX (sound effects): short, ALL-CAPS, onomatopoeia → type "sfx", shape "rectangle"
- Narration: boxes at top/bottom of panel with story/narrator text → type "narration", shape "rectangle"
- Thought bubbles: type "bubble", shape "cloud"
- Speech bubbles (default): type "bubble", shape "ellipse"
- Preserve exclamations, question marks, and emphasis
- Do NOT translate watermarks, website URLs, or credit text — skip those blocks entirely

Return ONLY valid JSON as an object keyed by image number. Each value is an array with one entry per block in that image:
{
  "${[...imageBlocks.keys()][0]}": [{ "index": 0, "translated": "Eu não acredito!", "type": "bubble", "shape": "ellipse" }]
}`;
}

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?\s*```\s*$/i, "");
  return cleaned.trim();
}

function validateEntry(
  e: Record<string, unknown>,
  blocks: OcrBlock[]
): TranslationEntry | null {
  const idx = Number(e.index);
  if (isNaN(idx) || idx < 0 || idx >= blocks.length) return null;

  const block = blocks[idx];
  const translated = String(e.translated || "");
  if (!translated) return null;

  const typeRaw = String(e.type || "");
  const shapeRaw = String(e.shape || "");

  const type = (
    ["bubble", "sfx", "narration"].includes(typeRaw) ? typeRaw : "bubble"
  ) as TranslationEntry["type"];
  const shape = (
    ["ellipse", "rectangle", "cloud"].includes(shapeRaw)
      ? shapeRaw
      : "ellipse"
  ) as TranslationEntry["shape"];

  const { x, y, width, height } = block.position;
  if (x < 0 || x > 100 || y < 0 || y > 100 || width <= 0 || height <= 0)
    return null;

  return {
    original: block.text,
    translated,
    position: block.position,
    type,
    shape,
  };
}

function parseBatchResponse(
  text: string,
  imageBlocks: Map<number, OcrBlock[]>
): Map<number, TranslationEntry[]> {
  const cleaned = cleanJsonResponse(text);
  const result = new Map<number, TranslationEntry[]>();

  // Initialize all images with empty arrays
  for (const imgIdx of imageBlocks.keys()) {
    result.set(imgIdx, []);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract a JSON object from the response
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        console.warn("[gemini-text] Failed to parse batch response JSON");
        return result;
      }
    } else {
      console.warn("[gemini-text] No JSON object found in batch response");
      return result;
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    console.warn("[gemini-text] Batch response is not an object");
    return result;
  }

  const obj = parsed as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    const imgIdx = Number(key);
    const blocks = imageBlocks.get(imgIdx);
    if (!blocks) continue;

    if (!Array.isArray(value)) continue;

    const entries: TranslationEntry[] = [];
    for (const item of value) {
      if (typeof item !== "object" || item === null) continue;
      const entry = validateEntry(item as Record<string, unknown>, blocks);
      if (entry) entries.push(entry);
    }

    result.set(imgIdx, entries);
  }

  // Log warnings for missing images
  for (const imgIdx of imageBlocks.keys()) {
    if (!obj.hasOwnProperty(String(imgIdx))) {
      console.warn(
        `[gemini-text] Image ${imgIdx} missing from batch response`
      );
    }
  }

  return result;
}

export async function translateBlocksBatch(
  imageBlocks: Map<number, OcrBlock[]>,
  maxRetries = 2
): Promise<Map<number, TranslationEntry[]>> {
  if (imageBlocks.size === 0) return new Map();

  const totalBlocks = [...imageBlocks.values()].reduce(
    (sum, b) => sum + b.length,
    0
  );
  const prompt = buildBatchPrompt(imageBlocks);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[gemini-text] Translating batch of ${imageBlocks.size} images (${totalBlocks} blocks) (attempt ${attempt + 1}/${maxRetries + 1})`
      );
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const text = response.text ?? "";
      console.log(
        `[gemini-text] Batch response received, length: ${text.length} chars`
      );
      const results = parseBatchResponse(text, imageBlocks);

      const totalEntries = [...results.values()].reduce(
        (sum, e) => sum + e.length,
        0
      );
      console.log(
        `[gemini-text] Parsed ${totalEntries} entries across ${results.size} images`
      );
      return results;
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      console.error(
        `[gemini-text] Error on attempt ${attempt + 1}: ${err.message} (status: ${err.status})`
      );
      if (err.status === 429) {
        await new Promise((r) => setTimeout(r, 5000 * Math.pow(2, attempt)));
        continue;
      }
      if (attempt === maxRetries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  return new Map();
}
