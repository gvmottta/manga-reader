import { useRef, useState, useEffect, useLayoutEffect } from "react";
import type { TranslationEntry } from "../api/client";

interface ImageOverlayProps {
  proxyUrl: string;
  entries: TranslationEntry[];
  index: number;
  translating?: boolean;
}

function getShapePadding(shape: string) {
  switch (shape) {
    case "rectangle":
      return "4% 6%";
    case "cloud":
      return "12% 14%";
    case "ellipse":
    default:
      return "14% 16%";
  }
}

function getShapeClass(shape: string) {
  switch (shape) {
    case "rectangle":
      return "rounded-sm";
    case "cloud":
      return "rounded-2xl";
    case "ellipse":
    default:
      return "rounded-full";
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
  const clamped = Math.max(1.2, Math.min(5.0, adjusted * 1.5));
  const px = (clamped / 100) * containerWidth;
  return Math.max(11, px);
}

interface BubbleProps {
  entry: TranslationEntry;
  fontSize: number;
  padding: string;
}

function TranslationBubble({ entry, fontSize: initialFontSize, padding }: BubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(initialFontSize);

  const shape = entry.shape || "ellipse";
  const isSfx = entry.type === "sfx";
  const shapeClass = getShapeClass(shape);

  useLayoutEffect(() => {
    setFontSize(initialFontSize);
  }, [initialFontSize]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 1) {
      setFontSize(prev => Math.max(10, prev * 0.9));
    }
  }, [fontSize]);

  return (
    <div
      ref={ref}
      className={`absolute flex items-center justify-center bg-white text-center leading-tight overflow-hidden ${shapeClass} ${isSfx ? "text-yellow-400 italic" : "text-black"}`}
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
}

export default function ImageOverlay({ proxyUrl, entries, index, translating }: ImageOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [showTranslations, setShowTranslations] = useState(true);

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
    <div
      className="relative block w-full"
      id={`image-${index}`}
      ref={containerRef}
      onClick={() => setShowTranslations(prev => !prev)}
    >
      <img
        src={proxyUrl}
        alt={`Panel ${index + 1}`}
        className="block w-full"
        loading="lazy"
      />
      {/* Translating badge (2.2) */}
      {entries.length === 0 && translating && (
        <div className="pointer-events-none absolute bottom-2 right-2 animate-pulse rounded-full bg-black/70 px-2 py-1 text-xs text-white">
          ⏳ Traduzindo
        </div>
      )}
      {/* Translations with tap-to-toggle (3.2) */}
      <div className={`transition-opacity duration-200 ${showTranslations ? "opacity-100" : "opacity-0"}`}>
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
            <TranslationBubble
              key={eIdx}
              entry={entry}
              fontSize={fontSize}
              padding={padding}
            />
          );
        })}
      </div>
    </div>
  );
}
