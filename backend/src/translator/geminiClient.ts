import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { parseGeminiResponse } from "./parseResponse.js";
import type { TranslationEntry } from "./types.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const TRANSLATION_PROMPT = `Analyze this manga/webtoon image panel.
For each speech bubble, text box, or visible text in English:
1. Extract the original English text
2. Translate it to Brazilian Portuguese (natural, colloquial)
3. Provide the bounding box of the **inner white area** of the balloon (not the outline/border)
4. Classify the text type and balloon shape

CRITICAL positioning rules:
- Coordinates must describe the INTERIOR fillable area of the balloon, excluding borders and tails
- Apply ~5% inward margin from the balloon edges so text never touches the border
- Verify: x + width <= 100 and y + height <= 100
- For oval/circular balloons, the bounding box should tightly fit the inner ellipse

Return ONLY a valid JSON array, no markdown fences:
[
  {
    "original": "I can't believe it!",
    "translated": "Eu não acredito!",
    "position": { "x": 15, "y": 8, "width": 25, "height": 6 },
    "type": "bubble",
    "shape": "ellipse"
  }
]

Position values are percentages of image dimensions (0-100):
- x: left edge of the inner text area
- y: top edge of the inner text area
- width: width of the inner text area
- height: height of the inner text area

Types: "bubble" (speech), "sfx" (sound effects), "narration" (narrator boxes)
Shapes: "ellipse" (oval/circular speech bubbles), "rectangle" (narration boxes, square bubbles), "cloud" (thought bubbles)

If there is no text in the image, return [].`;

export async function translateMangaPanel(
  imageUrl: string,
  maxRetries = 2
): Promise<TranslationEntry[]> {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  }
  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString("base64");

  const contentType = imageResponse.headers.get("content-type") || "image/webp";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: contentType,
                  data: base64Image,
                },
              },
              { text: TRANSLATION_PROMPT },
            ],
          },
        ],
      });

      const text = response.text ?? "";
      const entries = parseGeminiResponse(text);
      return entries;
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      if (err.status === 429) {
        // Rate limited - wait longer
        await new Promise((r) =>
          setTimeout(r, 5000 * Math.pow(2, attempt))
        );
        continue;
      }
      if (attempt === maxRetries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  return [];
}
