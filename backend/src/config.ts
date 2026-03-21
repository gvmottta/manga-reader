import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  azureVisionKey: process.env.AZURE_VISION_KEY || "",
  azureVisionEndpoint: process.env.AZURE_VISION_ENDPOINT || "",
};

export function validateConfig(): void {
  if (!config.geminiApiKey || config.geminiApiKey === "your_api_key_here") {
    console.error(
      "ERROR: GEMINI_API_KEY is not set. Get a free key at https://ai.google.dev/"
    );
    process.exit(1);
  }
  if (!config.azureVisionKey || !config.azureVisionEndpoint) {
    console.error(
      "ERROR: AZURE_VISION_KEY and AZURE_VISION_ENDPOINT must be set in .env"
    );
    process.exit(1);
  }
}
