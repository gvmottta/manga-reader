import type { ChapterImage } from "../api/client";

interface TranslationPanelProps {
  images: ChapterImage[];
  activeIndex: number;
}

export default function TranslationPanel({ images, activeIndex }: TranslationPanelProps) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      {images.map((img, idx) => {
        const entries = img.translation?.overlayData || [];
        if (entries.length === 0) return null;

        return (
          <div
            key={idx}
            id={`translation-${idx}`}
            className={`rounded-lg border p-3 transition-colors ${
              idx === activeIndex
                ? "border-purple-500 bg-gray-800"
                : "border-gray-700 bg-gray-900"
            }`}
          >
            <div className="mb-2 text-xs font-semibold text-gray-500">
              Image {idx + 1}
            </div>
            {entries.map((entry, eIdx) => (
              <div key={eIdx} className="mb-2 last:mb-0">
                <p className="text-xs text-gray-500 line-through">{entry.original}</p>
                <p className="text-sm text-gray-100">{entry.translated}</p>
                <span className="text-[10px] text-gray-600">
                  [{entry.type}]
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
