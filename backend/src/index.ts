import "./logger.js";
import express from "express";
import cors from "cors";
import { config, validateConfig } from "./config.js";
import { mangaRouter } from "./routes/manga.js";
import { proxyRouter } from "./routes/proxy.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { registerSource } from "./scraper/registry.js";
import { qtoonAdapter } from "./scraper/sources/qtoon.js";
import { mangadexAdapter } from "./scraper/sources/mangadex.js";

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

app.listen(config.port, () => {
  console.log(`Backend running on http://localhost:${config.port}`);
});
