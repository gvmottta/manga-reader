import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadManga, listComics, type Comic } from "../api/client";
import Navbar from "../components/Navbar";
import { Search, Loader2, BookOpen } from "lucide-react";

export default function InputPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [comics, setComics] = useState<Comic[]>([]);
  const [comicsLoading, setComicsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    listComics()
      .then((data) => setComics(data.comics))
      .catch(() => {})
      .finally(() => setComicsLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");
    try {
      const { comic } = await loadManga(url.trim());
      navigate(`/comic/${comic.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load manga");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />

      <div className="flex min-h-[60vh] flex-col items-center justify-center py-6">
        <img
          src="/logo.png"
          alt="Manga Reader"
          className="mb-6 h-28 w-28 object-contain drop-shadow-[0_0_24px_rgba(168,85,247,0.4)]"
        />
        <p className="mb-8 text-muted">
          Cola o link do mangá aqui, meu bem~
        </p>

        <form onSubmit={handleSubmit} className="flex w-full max-w-xl gap-3">
          <label htmlFor="url-input" className="sr-only">URL do mangá</label>
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="url-input"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Link ou ID do mangá"
              className="w-full rounded-lg border border-border bg-surface py-3 pl-10 pr-4 text-text placeholder-muted outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="flex items-center gap-2 rounded-lg bg-secondary px-6 py-3 font-semibold text-white transition hover:bg-primary disabled:opacity-50"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" />Buscando...</> : "Buscar"}
          </button>
        </form>

        <p className="mt-2 text-sm text-muted">
          Ex.: link do QToon ou MangaDex
        </p>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        {(comicsLoading || comics.length > 0) && (
          <div className="mt-12 w-full max-w-4xl">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="whitespace-nowrap text-xl font-semibold text-text">
                Seus mangás
              </h2>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {comicsLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface"
                    >
                      <div className="aspect-[3/4] w-full animate-pulse bg-surface-2" />
                      <div className="space-y-2 p-3">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-surface-2" />
                      </div>
                    </div>
                  ))
                : comics.map((comic) => (
                    <button
                      key={comic.id}
                      onClick={() => navigate(`/comic/${comic.id}`)}
                      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition hover:-translate-y-1 hover:border-secondary hover:shadow-lg hover:shadow-secondary/20"
                    >
                      {comic.cover_url ? (
                        <div className="overflow-hidden">
                          <img
                            src={`/api/proxy/image?url=${encodeURIComponent(comic.cover_url)}`}
                            alt={comic.title}
                            className="aspect-[3/4] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-[3/4] w-full items-center justify-center bg-surface-2">
                          <BookOpen size={32} className="text-muted" />
                        </div>
                      )}
                      <div className="p-3">
                        <p className="line-clamp-2 text-sm font-medium text-text group-hover:text-secondary">
                          {comic.title}
                        </p>
                        {comic.author && (
                          <p className="mt-1 text-xs text-muted">
                            {comic.author}
                          </p>
                        )}
                        {comic.total_chapters != null && (
                          <p className="mt-1 text-xs text-muted">
                            {comic.total_chapters} capítulos
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
