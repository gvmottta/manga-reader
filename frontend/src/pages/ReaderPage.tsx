import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  startTranslation,
  getTranslationStatus,
  getChapterImages,
  getChapters,
  type ChapterImage,
  type TranslationProgress,
  type Comic,
  type Chapter,
} from "../api/client";
import ProgressBar from "../components/ProgressBar";
import TranslationPanel from "../components/TranslationPanel";
import ImageOverlay from "../components/ImageOverlay";

type DisplayMode = "panel" | "overlay";

export default function ReaderPage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();
  const comicId = Number(id);
  const chapId = Number(chapterId);

  const [images, setImages] = useState<ChapterImage[]>([]);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [mode, setMode] = useState<DisplayMode>("overlay");
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");
  const [comic, setComic] = useState<Comic | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const imageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Start translation and poll
  useEffect(() => {
    let cancelled = false;
    let lastCompleted = -1;

    async function init() {
      try {
        const { comic: c, chapters } = await getChapters(comicId);
        if (!cancelled) {
          setComic(c);
          setAllChapters(chapters);
          const ch = chapters.find((ch) => ch.id === chapId) ?? null;
          setChapter(ch);
        }

        const { progress: p } = await startTranslation(comicId, chapId);
        if (cancelled) return;
        setProgress(p);

        // Fetch images immediately (even without translations)
        const { images } = await getChapterImages(comicId, chapId);
        if (cancelled) return;
        setImages(images);

        if (p.status === "done") return;

        // Poll status + re-fetch images when completed changes
        lastCompleted = p.completed;
        pollRef.current = setInterval(async () => {
          try {
            const status = await getTranslationStatus(comicId, chapId);
            if (cancelled) return;
            setProgress(status);

            if (status.completed > lastCompleted) {
              lastCompleted = status.completed;
              const { images } = await getChapterImages(comicId, chapId);
              if (!cancelled) setImages(images);
            }

            if (status.status === "done" || status.status === "error") {
              clearInterval(pollRef.current);
            }
          } catch {
            // ignore poll errors
          }
        }, 2000);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to start");
      }
    }

    init();
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
    };
  }, [comicId, chapId]);

  // IntersectionObserver for active image tracking
  const observerRef = useRef<IntersectionObserver>(undefined);
  const setImageRef = useCallback(
    (el: HTMLDivElement | null, idx: number) => {
      imageRefs.current[idx] = el;
    },
    []
  );

  useEffect(() => {
    if (images.length === 0 || mode !== "panel") return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute("data-index"));
            if (!isNaN(idx)) setActiveIndex(idx);
          }
        }
      },
      { threshold: 0.5 }
    );

    imageRefs.current.forEach((el) => {
      if (el) observerRef.current!.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [images, mode]);

  if (error) {
    return (
      <div className="text-center">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded bg-purple-600 px-4 py-2 text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  const freeChapters = allChapters
    .filter((ch) => ch.is_free === 1)
    .sort((a, b) => (a.chapter_number ?? 0) - (b.chapter_number ?? 0));
  const currentIdx = freeChapters.findIndex((ch) => ch.id === chapId);
  const prevChapter = currentIdx > 0 ? freeChapters[currentIdx - 1] : null;
  const nextChapter =
    currentIdx < freeChapters.length - 1 ? freeChapters[currentIdx + 1] : null;

  return (
    <div>
      {/* Chapter info header */}
      {comic && (
        <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
          <Link
            to={`/comic/${comicId}`}
            className="text-sm text-purple-400 hover:text-purple-300"
          >
            ← {comic.title}
          </Link>
          {chapter && (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xl font-bold">
                Capítulo {chapter.chapter_number}
              </span>
              {chapter.title && (
                <span className="text-gray-300">{chapter.title}</span>
              )}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-500">
            {comic.author && <span>Autor: {comic.author}</span>}
            {comic.total_chapters && (
              <span>{comic.total_chapters} capítulos no total</span>
            )}
            {comic.serial_status && (
              <span>
                {comic.serial_status.toLowerCase() === "serializing"
                  ? "Em serialização"
                  : comic.serial_status}
              </span>
            )}
            {chapter?.is_free === 1 && (
              <span className="text-green-400">Gratuito</span>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          {prevChapter && (
            <Link
              to={`/comic/${comicId}/read/${prevChapter.id}`}
              className="rounded border border-gray-700 px-3 py-1 text-sm transition hover:border-purple-500"
            >
              ← Cap. {prevChapter.chapter_number}
            </Link>
          )}
          {nextChapter && (
            <Link
              to={`/comic/${comicId}/read/${nextChapter.id}`}
              className="rounded border border-gray-700 px-3 py-1 text-sm transition hover:border-purple-500"
            >
              Cap. {nextChapter.chapter_number} →
            </Link>
          )}
        </div>
        {images.length > 0 && (
          <button
            onClick={() => setMode(mode === "panel" ? "overlay" : "panel")}
            className="rounded border border-gray-700 px-3 py-1 text-sm transition hover:border-purple-500"
          >
            {mode === "panel" ? "Switch to Overlay" : "Switch to Panel"}
          </button>
        )}
      </div>

      {/* Inline progress bar above images */}
      {progress && progress.status !== "done" && progress.total > 0 && (
        <div className="mb-4">
          <ProgressBar
            completed={progress.completed}
            total={progress.total}
            status={progress.status}
            error={progress.error}
          />
        </div>
      )}

      {/* Reader */}
      {images.length > 0 && mode === "panel" && (
        <div className="flex gap-4">
          {/* Images */}
          <div className="flex-1">
            {images.map((img, idx) => (
              <div
                key={idx}
                ref={(el) => setImageRef(el, idx)}
                data-index={idx}
              >
                <img
                  src={img.proxyUrl}
                  alt={`Panel ${idx + 1}`}
                  className="w-full"
                  loading="lazy"
                />
              </div>
            ))}
          </div>

          {/* Side panel */}
          <div className="sticky top-0 hidden h-screen w-80 shrink-0 overflow-y-auto lg:block">
            <TranslationPanel images={images} activeIndex={activeIndex} />
          </div>
        </div>
      )}

      {images.length > 0 && mode === "overlay" && (
        <div className="mx-auto max-w-2xl">
          {images.map((img, idx) => (
            <ImageOverlay
              key={idx}
              proxyUrl={img.proxyUrl}
              entries={img.translation?.overlayData || []}
              index={idx}
            />
          ))}
        </div>
      )}
    </div>
  );
}
