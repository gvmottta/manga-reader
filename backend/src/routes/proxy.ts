import { Router } from "express";

export const proxyRouter = Router();

const ALLOWED_HOSTNAMES = ["resource.qqtoon.com"];

proxyRouter.get("/image", async (req, res, next) => {
  try {
    const imageUrl = req.query.url as string;
    if (!imageUrl) {
      res.status(400).json({ error: "Missing url parameter" });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }

    if (!ALLOWED_HOSTNAMES.includes(parsed.hostname)) {
      res.status(400).json({ error: "Hostname not allowed" });
      return;
    }

    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://qtoon.com/",
      },
    });

    if (!response.ok) {
      res.status(response.status).json({ error: "Failed to fetch image" });
      return;
    }

    const contentType = response.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");

    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
