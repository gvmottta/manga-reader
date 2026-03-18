import type { TranslationEntry } from "./types.js";

export function parseGeminiResponse(text: string): TranslationEntry[] {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?\s*```\s*$/i, "");
  cleaned = cleaned.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON array from the text
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

  return parsed
    .filter(
      (entry: unknown) =>
        entry !== null &&
        typeof entry === "object" &&
        "original" in (entry as Record<string, unknown>) &&
        "translated" in (entry as Record<string, unknown>)
    )
    .map((entry: unknown) => {
      const e = entry as Record<string, unknown>;
      const pos = (e.position as Record<string, unknown>) || {};
      return {
        original: String(e.original || ""),
        translated: String(e.translated || ""),
        position: {
          x: Number(pos.x ?? 0),
          y: Number(pos.y ?? 0),
          width: Number(pos.width ?? 100),
          height: Number(pos.height ?? 10),
        },
        type: (["bubble", "sfx", "narration"].includes(String(e.type))
          ? String(e.type)
          : "bubble") as "bubble" | "sfx" | "narration",
        shape: (["ellipse", "rectangle", "cloud"].includes(String(e.shape))
          ? String(e.shape)
          : "ellipse") as "ellipse" | "rectangle" | "cloud",
      };
    });
}
