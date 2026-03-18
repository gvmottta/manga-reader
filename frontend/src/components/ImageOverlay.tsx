import { useRef, useState, useEffect } from "react";
import type { TranslationEntry } from "../api/client";

interface ImageOverlayProps {
  proxyUrl: string;
  entries: TranslationEntry[];
  index: number;
}

function getShapePadding(shape: string) {
  switch (shape) {
    case "rectangle":
      return "4% 6%";
    case "cloud":
      return "12% 14%";
    case "ellipse":
    default:
      // Elliptical balloons need more padding so text stays inside the inscribed rectangle
      return "14% 16%";
  }
}

function calcFontSizePx(
  width: number,
  height: number,
  textLength: number,
  containerWidth: number
): number {
  const area = width * height;
  const base = Math.sqrt(area) * 0.45;
  const adjusted = base / Math.sqrt(Math.max(textLength / 8, 1));
  const clamped = Math.max(1.2, Math.min(5.0, adjusted * 2));
  const px = (clamped / 100) * containerWidth;
  return Math.max(16, px);
}

export default function ImageOverlay({ proxyUrl, entries, index }: ImageOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="relative inline-block w-full" id={`image-${index}`} ref={containerRef}>
      <img
        src={proxyUrl}
        alt={`Panel ${index + 1}`}
        className="w-full"
        loading="lazy"
      />
      {containerWidth > 0 && entries.map((entry, eIdx) => {
        const shape = entry.shape || "ellipse";
        const padding = getShapePadding(shape);
        const fontSize = calcFontSizePx(
          entry.position.width,
          entry.position.height,
          entry.translated.length,
          containerWidth
        );

        return (
          <div
            key={eIdx}
            className="absolute flex items-center justify-center bg-white/80 text-center leading-tight text-black overflow-hidden rounded"
            style={{
              left: `${entry.position.x}%`,
              top: `${entry.position.y}%`,
              width: `${entry.position.width}%`,
              height: `${entry.position.height}%`,
              fontSize: `${fontSize}px`,
              padding,
              boxSizing: "border-box",
              fontFamily: "'Bangers', cursive",
              letterSpacing: "0.04em",
            }}
          >
            {entry.translated}
          </div>
        );
      })}
    </div>
  );
}
