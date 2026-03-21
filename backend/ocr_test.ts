import { createWorker, PSM } from "tesseract.js";
import sharp from "sharp";

const IMAGE_URL = "https://resource.qqtoon.com/resource/2r_l8lm2p8yQykHHTgaPZWFpmdLgliLcOiaStc9G01.png?x-oss-process=image%2Fresize%2Cw_860%2Cm_lfit%2Fformat%2Cwebp";

async function main() {
  const response = await fetch(IMAGE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://qtoon.com/",
    },
  });
  const buf = Buffer.from(await response.arrayBuffer());
  console.log("Image fetched:", buf.byteLength, "bytes");

  const { data: buffer, info } = await sharp(buf)
    .resize(768, undefined, { fit: "inside", withoutEnlargement: true })
    .grayscale()
    .normalise()
    .png()
    .toBuffer({ resolveWithObject: true });
  console.log("Preprocessed:", info.width, "x", info.height);

  const worker = await createWorker("eng");
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });

  const { data } = await worker.recognize(buffer);
  console.log("Full text:", JSON.stringify(data.text.substring(0, 300)));
  console.log("Blocks:", data.blocks?.length ?? 0);
  if (data.blocks) {
    (data.blocks as any[]).forEach((b, i) => {
      console.log(`  Block ${i}: conf=${b.confidence.toFixed(0)} text="${b.text.replace(/\n/g,' ').trim().substring(0,80)}"`);
    });
  }
  await worker.terminate();
}

main().catch(console.error);
