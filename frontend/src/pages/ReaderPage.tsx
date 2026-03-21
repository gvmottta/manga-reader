import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, ArrowUp } from "lucide-react";
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
import ImageOverlay from "../components/ImageOverlay";
import { useReadHistory } from "../hooks/useReadHistory";

export default function ReaderPage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();
  const comicId = Number(id);
  const chapId = Number(chapterId);

  const [images, setImages] = useState<ChapterImage[]>([]);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showCounter, setShowCounter] = useState(false);
  const [error, setError] = useState("");
  const [comic, setComic] = useState<Comic | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const { markAsRead } = useReadHistory();
  const navigate = useNavigate();
  const touchStartX = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const imageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver>(undefined);
  const counterTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Scroll to top on chapter change (1.1)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [chapId]);

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

        markAsRead(chapId, comicId);
        const { progress: p } = await startTranslation(comicId, chapId);
        if (cancelled) return;
        setProgress(p);

        const { images } = await getChapterImages(comicId, chapId);
        if (cancelled) return;
        setImages(images);

        if (p.status === "done") return;

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

  async function handleRetry() {
    clearInterval(pollRef.current);
    setProgress(null);
    setImages([]);
    let cancelled = false;
    let lastCompleted = -1;

    try {
      const { progress: p } = await startTranslation(comicId, chapId, true);
      setProgress(p);

      const { images } = await getChapterImages(comicId, chapId);
      setImages(images);

      if (p.status === "done") return;

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
        setError(err instanceof Error ? err.message : "Failed to retry");
    }

    return () => { cancelled = true; };
  }

  // IntersectionObserver — always active (2.3)
  const setImageRef = useCallback(
    (el: HTMLDivElement | null, idx: number) => {
      imageRefs.current[idx] = el;
    },
    []
  );

  useEffect(() => {
    if (images.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute("data-index"));
            if (!isNaN(idx)) {
              setActiveIndex(idx);
              setShowCounter(true);
              clearTimeout(counterTimerRef.current);
              counterTimerRef.current = setTimeout(
                () => setShowCounter(false),
                2000
              );
            }
          }
        }
      },
      { threshold: 0.5 }
    );

    imageRefs.current.forEach((el) => {
      if (el) observerRef.current!.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [images]);

  if (error) {
    return (
      <div className="px-4 py-6 text-center">
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

  const isTranslating =
    progress !== null &&
    progress.status !== "done" &&
    progress.status !== "error";

  const navLinks = (
    <div className="flex gap-2">
      {prevChapter && (
        <Link
          to={`/comic/${comicId}/read/${prevChapter.id}`}
          className="flex items-center gap-1.5 rounded-full border border-gray-700 px-4 py-2 text-sm font-medium transition hover:border-purple-500 hover:text-purple-300"
        >
          <ChevronLeft size={14} />
          Cap. {prevChapter.chapter_number}
        </Link>
      )}
      {nextChapter && (
        <Link
          to={`/comic/${comicId}/read/${nextChapter.id}`}
          className="flex items-center gap-1.5 rounded-full border border-gray-700 px-4 py-2 text-sm font-medium transition hover:border-purple-500 hover:text-purple-300"
        >
          Cap. {nextChapter.chapter_number}
          <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) < 50) return;
    if (delta > 0 && prevChapter) navigate(`/comic/${comicId}/read/${prevChapter.id}`);
    if (delta < 0 && nextChapter) navigate(`/comic/${comicId}/read/${nextChapter.id}`);
  }

  return (
    <div
      className="px-4 py-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Chapter info header */}
      {comic && (
        <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-gray-800 bg-gray-900/90 px-4 py-3 backdrop-blur-md">
          <Link
            to={`/comic/${comicId}`}
            className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
          >
            <ChevronLeft size={14} />
            {comic.title}
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

      {/* Top controls */}
      <div className="mb-4 flex items-center justify-between">
        {navLinks}
      </div>

      {/* Progress bar */}
      {progress && progress.total > 0 && (
        <div className="mb-4">
          <ProgressBar
            completed={progress.completed}
            total={progress.total}
            status={progress.status}
            error={progress.error}
            onRetry={handleRetry}
          />
        </div>
      )}

      {/* Image skeletons while loading */}
      {images.length === 0 && progress !== null && (
        <div className="mx-auto max-w-2xl space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] w-full animate-pulse rounded-lg bg-gray-800" />
          ))}
        </div>
      )}

      {/* Overlay */}
      {images.length > 0 && (
        <div className="mx-auto max-w-2xl">
          {images.map((img, idx) => (
            <div
              key={idx}
              ref={(el) => setImageRef(el, idx)}
              data-index={idx}
            >
              <ImageOverlay
                proxyUrl={img.proxyUrl}
                entries={img.translation?.overlayData || []}
                translating={!img.translation && isTranslating}
                index={idx}
              />
            </div>
          ))}
        </div>
      )}

      {/* Bottom navigation (1.3) */}
      {images.length > 0 && (
        <div className="mt-6 flex items-center justify-between border-t border-gray-800 pt-4">
          {navLinks}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-1.5 rounded-full border border-gray-700 px-4 py-2 text-sm font-medium transition hover:border-purple-500 hover:text-purple-300"
          >
            <ArrowUp size={14} />
            Topo
          </button>
        </div>
      )}

      {/* Page counter (3.1) */}
      {images.length > 0 && (
        <div
          style={{ bottom: "calc(1rem + var(--safe-bottom))" }}
          className={`pointer-events-none fixed left-4 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white transition-opacity duration-300 ${
            showCounter ? "opacity-100" : "opacity-0"
          }`}
        >
          {activeIndex + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
