import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getChapters, type Comic, type Chapter } from "../api/client";
import { useReadHistory } from "../hooks/useReadHistory";
import Navbar from "../components/Navbar";
import { Play, Check, Lock, ChevronRight, RefreshCw, Languages } from "lucide-react";

export default function ComicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [comic, setComic] = useState<Comic | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { isRead, getLastReadChapterId } = useReadHistory();

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

  const header = <Navbar backTo={{ href: "/", label: "Voltar" }} />;

  if (loading) {
    return (
      <>
        {header}
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="mb-8 flex gap-6">
            <div className="aspect-[3/4] w-28 animate-pulse self-start rounded-lg bg-surface-2 sm:w-44" />
            <div className="flex-1 space-y-3">
              <div className="h-8 w-3/4 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-1/4 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
          <div className="grid gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-surface-2"
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
            className="mt-4 flex items-center gap-2 rounded bg-secondary px-4 py-2 text-white transition hover:bg-primary"
          >
            <RefreshCw size={14} />
            Tentar de novo
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
          <p className="text-muted">Ops, não achei esse mangá</p>
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
              <p className="mt-1 text-sm text-muted">{comic.author}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              {comic.total_chapters != null && <span>{comic.total_chapters} capítulos</span>}
              {comic.serial_status && (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                    comic.serial_status.toLowerCase() === "serializing"
                      ? "border-green-800/50 bg-green-900/40 text-green-400"
                      : "border-border bg-surface-2 text-muted"
                  }`}
                >
                  {comic.serial_status.toLowerCase() === "serializing" ? "Em serialização" : comic.serial_status}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <h2 className="whitespace-nowrap text-xl font-semibold">Capítulos disponíveis</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        {(() => {
          const lastId = getLastReadChapterId(comic.id);
          if (!lastId) return null;
          return (
            <Link
              to={`/comic/${comic.id}/read/${lastId}`}
              className="mb-4 flex items-center gap-2 rounded-lg border border-secondary/50 bg-secondary/10 px-4 py-3 text-sm font-medium text-secondary transition hover:border-secondary hover:bg-secondary/20"
            >
              <Play size={14} fill="currentColor" />
              Continuar de onde parou
            </Link>
          );
        })()}
        <div className="grid gap-2">
          {chapters.map((ch) => {
            const isFree = ch.is_free === 1;
            const read = isRead(ch.id);
            return isFree ? (
              <Link
                key={ch.id}
                to={`/comic/${comic.id}/read/${ch.id}`}
                className="group flex items-center justify-between rounded-lg border border-border px-4 py-3 transition hover:border-secondary hover:bg-surface/60"
              >
                <span className={read ? "text-muted" : undefined}>
                  Ch. {ch.chapter_number} — {ch.title || "Sem título"}
                </span>
                <div className="flex items-center gap-2">
                  {ch.translation_status === "complete" && (
                    <span className="flex items-center gap-1 text-xs text-blue-400">
                      <Languages size={12} /> Traduzido
                    </span>
                  )}
                  {ch.translation_status === "partial" && (
                    <span className="flex items-center gap-1 text-xs text-yellow-400">
                      <Languages size={12} /> Parcial
                    </span>
                  )}
                  {read && (
                    <span className="flex items-center gap-1 text-xs text-green-500">
                      <Check size={12} /> Já leu
                    </span>
                  )}
                  <ChevronRight size={14} className="text-muted opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-secondary" />
                </div>
              </Link>
            ) : (
              <div
                key={ch.id}
                className="flex cursor-not-allowed items-center justify-between rounded-lg border border-border px-4 py-3 opacity-50"
              >
                <span>
                  Ch. {ch.chapter_number} — {ch.title || "Sem título"}
                </span>
                <span className="flex items-center gap-1 text-xs text-yellow-400">
                  <Lock size={12} /> Bloqueado
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
