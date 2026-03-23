import "./logger.js";
import express from "express";
import cors from "cors";
import serverless from "serverless-http";
import { config, validateConfig } from "./config.js";
import { mangaRouter } from "./routes/manga.js";
import { proxyRouter } from "./routes/proxy.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { registerSource } from "./scraper/registry.js";
import { qtoonAdapter } from "./scraper/sources/qtoon.js";
import { mangadexAdapter } from "./scraper/sources/mangadex.js";
import { translateChapter } from "./translator/translationService.js";
import { setJobProgress } from "./services/translationJobs.js";

validateConfig();
registerSource(qtoonAdapter);
registerSource(mangadexAdapter);

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/manga", mangaRouter);
app.use("/api/proxy", proxyRouter);

app.use(errorHandler);

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  app.listen(config.port, () => {
    console.log(`Backend running on http://localhost:${config.port}`);
  });
}

const serverlessHandler = serverless(app);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (event: any, context: any) => {
  if (event.__translateJob) {
    const { chapterId, comicSourceId, sourceName } = event as {
      chapterId: number;
      comicSourceId: string;
      sourceName: string;
    };
    await translateChapter(chapterId, comicSourceId, sourceName, (progress) => {
      setJobProgress(chapterId, progress);
    });
    return { statusCode: 200 };
  }
  return serverlessHandler(event, context);
};
