import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getChapters, type Comic, type Chapter } from "../api/client";

export default function ComicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [comic, setComic] = useState<Comic | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    if (!id) return;
    setLoading(true);
    setError("");
    getChapters(Number(id))
      .then(({ comic, chapters }) => {
        setComic(comic);
        setChapters(
          [...chapters].sort(
            (a, b) => (b.chapter_number ?? 0) - (a.chapter_number ?? 0)
          )
        );
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [id]);

  const header = (
    <header
      className="border-b border-gray-800 px-6"
      style={{
        paddingTop: "calc(0.75rem + var(--safe-top))",
        paddingBottom: "0.75rem",
      }}
    >
      <Link
        to="/"
        className="text-xl font-bold text-purple-400 hover:text-purple-300"
      >
        Manga Translator
      </Link>
    </header>
  );

  if (loading) {
    return (
      <>
        {header}
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="mb-8 flex gap-6">
            <div className="aspect-[3/4] w-28 animate-pulse self-start rounded-lg bg-gray-800 sm:w-44" />
            <div className="flex-1 space-y-3">
              <div className="h-8 w-3/4 animate-pulse rounded bg-gray-800" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-gray-800" />
              <div className="h-4 w-1/4 animate-pulse rounded bg-gray-800" />
            </div>
          </div>
          <div className="grid gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-gray-800"
              />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {header}
        <div className="mx-auto max-w-7xl px-4 py-6">
          <p className="text-red-400">{error}</p>
          <button
            onClick={load}
            className="mt-4 rounded bg-purple-600 px-4 py-2 text-white transition hover:bg-purple-500"
          >
            Tentar novamente
          </button>
        </div>
      </>
    );
  }

  if (!comic) {
    return (
      <>
        {header}
        <div className="mx-auto max-w-7xl px-4 py-6">
          <p className="text-gray-400">Quadrinho não encontrado</p>
        </div>
      </>
    );
  }

  const coverProxy = comic.cover_url
    ? `/api/proxy/image?url=${encodeURIComponent(comic.cover_url)}`
    : null;

  return (
    <>
      {header}
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-8 flex gap-6">
          {coverProxy && (
            <img
              src={coverProxy}
              alt={comic.title}
              className="h-auto w-28 self-start rounded-lg object-cover shadow-lg sm:w-44"
              style={{ aspectRatio: "3/4" }}
            />
          )}
          <div>
            <h1 className="text-3xl font-bold">{comic.title}</h1>
            {comic.author && (
              <p className="mt-1 text-gray-400">by {comic.author}</p>
            )}
            <p className="mt-2 text-sm text-gray-500">
              {comic.total_chapters} chapters &middot;{" "}
              {comic.serial_status?.toLowerCase() === "serializing"
                ? "Ongoing"
                : comic.serial_status}
            </p>
          </div>
        </div>

        <h2 className="mb-4 text-xl font-semibold">Chapters</h2>
        <div className="grid gap-2">
          {chapters.map((ch) => {
            const isFree = ch.is_free === 1;
            return isFree ? (
              <Link
                key={ch.id}
                to={`/comic/${comic.id}/read/${ch.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-800 px-4 py-3 transition hover:border-purple-500 hover:bg-gray-900"
              >
                <span>
                  Ch. {ch.chapter_number} — {ch.title || "Untitled"}
                </span>
                <span className="text-xs text-green-400">FREE</span>
              </Link>
            ) : (
              <div
                key={ch.id}
                className="flex cursor-not-allowed items-center justify-between rounded-lg border border-gray-800 px-4 py-3 opacity-50"
              >
                <span>
                  Ch. {ch.chapter_number} — {ch.title || "Untitled"}
                </span>
                <span className="text-xs text-yellow-400">LOCKED</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
