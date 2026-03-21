import { useRef, useState, useEffect, useLayoutEffect } from "react";
import type { TranslationEntry } from "../api/client";
import { Loader2 } from "lucide-react";

interface ImageOverlayProps {
  proxyUrl: string;
  entries: TranslationEntry[];
  index: number;
  translating?: boolean;
}

function getShapePaddingFractions(shape: string): { padY: number; padX: number } {
  switch (shape) {
    case "rectangle":
      return { padY: 0.15, padX: 0.12 };
    case "cloud":
      return { padY: 0.20, padX: 0.18 };
    case "ellipse":
    default:
      return { padY: 0.22, padX: 0.20 };
  }
}

/**
 * Compute padding in pixels based on the element's own dimensions,
 * not the container's width (which CSS % padding uses). This prevents
 * tiny elements from being blown up by disproportionate padding.
 */
function calcPaddingPx(
  widthPct: number,
  heightPct: number,
  containerWidth: number,
  containerHeight: number,
  shape: string
): string {
  const { padY, padX } = getShapePaddingFractions(shape);
  const elW = (widthPct / 100) * containerWidth;
  const elH = (heightPct / 100) * containerHeight;
  const px = Math.max(2, padY * elH);
  const py = Math.max(2, padX * elW);
  return `${px}px ${py}px`;
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
  const areaBased = Math.sqrt(area) * 0.55;
  const base = Math.min(areaBased, 20.0);
  const adjusted = base / Math.sqrt(Math.max(textLength / 8, 1));
  const clamped = Math.max(1.5, Math.min(6.0, adjusted * 1.5));
  const px = (clamped / 100) * containerWidth;
  return Math.max(13, px);
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
  const isNarration = entry.type === "narration";
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
      className={`absolute flex items-center justify-center text-center leading-tight overflow-hidden ${shapeClass} ${
        isSfx
          ? "bg-transparent text-yellow-400 italic"
          : isNarration
          ? "bg-[#f5f0dc] border-l-2 border-gray-400 text-black"
          : "bg-white text-black"
      }`}
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
        boxShadow: isSfx ? "none" : "0 2px 8px rgba(0,0,0,0.45)",
        filter: isSfx ? "drop-shadow(0 1px 2px rgba(0,0,0,0.8))" : undefined,
      }}
    >
      {entry.translated}
    </div>
  );
}

export default function ImageOverlay({ proxyUrl, entries, index, translating }: ImageOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [showTranslations, setShowTranslations] = useState(true);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
      setContainerHeight(entries[0].contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (entries.length === 0) return;
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(t);
  }, [entries.length]);

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
      {/* Translating badge */}
      {entries.length === 0 && translating && (
        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white">
          <Loader2 size={10} className="animate-spin" />
          Traduzindo
        </div>
      )}
      {/* Toggle hint */}
      {showHint && entries.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white opacity-80 transition-opacity duration-500">
          Toque para ocultar traduções
        </div>
      )}
      {/* Translations with tap-to-toggle (3.2) */}
      <div className={`absolute inset-0 overflow-hidden transition-opacity duration-200 ${showTranslations ? "opacity-100" : "opacity-0"}`}>
        {containerWidth > 0 && containerHeight > 0 && entries.map((entry, eIdx) => {
          const shape = entry.shape || "ellipse";
          const padding = calcPaddingPx(
            entry.position.width,
            entry.position.height,
            containerWidth,
            containerHeight,
            shape
          );
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
