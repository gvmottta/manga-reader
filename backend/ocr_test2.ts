import { createWorker, PSM } from "tesseract.js";
import sharp from "sharp";

// Try multiple images and PSM modes
const urls = JSON.parse(require('fs').readFileSync('../manga-reader.db').length > 0 ? '[]' : '[]');

// Get URLs from DB
const { default: Database } = await import("better-sqlite3");
const db = new Database("manga-reader.db");
const chapter = db.prepare("SELECT image_urls FROM chapters WHERE id=1").get() as any;
const imageUrls: string[] = JSON.parse(chapter.image_urls);
db.close();

// Test images 8, 12, 18 (more likely to have dialogue)
const testUrls = [imageUrls[8], imageUrls[12], imageUrls[18]];

for (const url of testUrls) {
  console.log("\n=== Testing:", url.substring(0, 60) + "...");
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://qtoon.com/",
    },
  });
  const buf = Buffer.from(await response.arrayBuffer());
  console.log("Size:", buf.byteLength, "bytes");

  const { data: buffer, info } = await sharp(buf)
    .resize(768, undefined, { fit: "inside", withoutEnlargement: true })
    .grayscale().normalise().png()
    .toBuffer({ resolveWithObject: true });
  console.log("Dims:", info.width, "x", info.height);

  for (const psm of [PSM.AUTO, PSM.SPARSE_TEXT, PSM.SINGLE_BLOCK]) {
    const worker = await createWorker("eng");
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(buffer);
    const text = data.text.trim();
    console.log(`  PSM ${psm}: blocks=${data.blocks?.length ?? 0} text="${text.substring(0,100)}"`);
    await worker.terminate();
  }
}
