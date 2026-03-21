import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import type { TranslationEntry } from "./types.js";
import type { OcrBlock } from "./ocrClient.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

function buildPrompt(blocks: OcrBlock[]): string {
  const blockList = blocks.map((b, i) => `[${i}] "${b.text}"`).join("\n");
  return `You are a manga translator. Below are text blocks extracted by OCR from a manga panel.

Text blocks:
${blockList}

For each block, provide a Brazilian Portuguese (pt-BR) translation and classify it.

Rules:
- Translations must be natural and colloquial, appropriate for manga dialogue
- SFX (sound effects): short, ALL-CAPS, onomatopoeia → type "sfx", shape "rectangle"
- Narration: boxes at top/bottom of panel with story/narrator text → type "narration", shape "rectangle"
- Thought bubbles: type "bubble", shape "cloud"
- Speech bubbles (default): type "bubble", shape "ellipse"
- Preserve exclamations, question marks, and emphasis

Return ONLY a valid JSON array with exactly ${blocks.length} elements, in the same order:
[
  { "index": 0, "translated": "Eu não acredito!", "type": "bubble", "shape": "ellipse" }
]`;
}

function parseTextResponse(
  text: string,
  blocks: OcrBlock[]
): TranslationEntry[] {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?\s*```\s*$/i, "");
  cleaned = cleaned.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const entries: TranslationEntry[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const e = item as Record<string, unknown>;

    const idx = Number(e.index);
    if (isNaN(idx) || idx < 0 || idx >= blocks.length) continue;

    const block = blocks[idx];
    const translated = String(e.translated || "");
    if (!translated) continue;

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
    if (
      x < 0 || x > 100 ||
      y < 0 || y > 100 ||
      width <= 0 ||
      height <= 0
    )
      continue;

    entries.push({
      original: block.text,
      translated,
      position: block.position,
      type,
      shape,
    });
  }

  return entries;
}

export async function translateBlocks(
  blocks: OcrBlock[],
  maxRetries = 2
): Promise<TranslationEntry[]> {
  if (blocks.length === 0) return [];

  const prompt = buildPrompt(blocks);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[gemini-text] Translating ${blocks.length} blocks (attempt ${attempt + 1}/${maxRetries + 1})`
      );
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const text = response.text ?? "";
      console.log(
        `[gemini-text] Response received, length: ${text.length} chars`
      );
      const entries = parseTextResponse(text, blocks);
      console.log(`[gemini-text] Parsed ${entries.length} entries`);
      return entries;
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

  return [];
}
