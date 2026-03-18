import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
};

export function validateConfig(): void {
  if (!config.geminiApiKey || config.geminiApiKey === "your_api_key_here") {
    console.error(
      "ERROR: GEMINI_API_KEY is not set. Get a free key at https://ai.google.dev/"
    );
    process.exit(1);
  }
}
