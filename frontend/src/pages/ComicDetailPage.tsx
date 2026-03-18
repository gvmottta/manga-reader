import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getChapters, type Comic, type Chapter } from "../api/client";

export default function ComicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [comic, setComic] = useState<Comic | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getChapters(Number(id))
      .then(({ comic, chapters }) => {
        setComic(comic);
        setChapters(chapters);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-gray-400">Loading...</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!comic) return <p className="text-gray-400">Comic not found</p>;

  const coverProxy = comic.cover_url
    ? `/api/proxy/image?url=${encodeURIComponent(comic.cover_url)}`
    : null;

  return (
    <div>
      <div className="mb-8 flex gap-6">
        {coverProxy && (
          <img
            src={coverProxy}
            alt={comic.title}
            className="h-64 w-44 rounded-lg object-cover shadow-lg"
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
  );
}
