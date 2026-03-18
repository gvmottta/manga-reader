import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loadManga, listComics, type Comic } from "../api/client";

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

      <div className="flex min-h-[60vh] flex-col items-center justify-center py-6">
        <h1 className="mb-2 text-4xl font-bold text-purple-400">
          Manga Translator
        </h1>
        <p className="mb-8 text-gray-400">
          Cole uma URL do QToon ou um ID para começar
        </p>

        <form onSubmit={handleSubmit} className="flex w-full max-w-xl gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="URL do QToon ou ID"
            className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 placeholder-gray-500 outline-none focus:border-purple-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Carregar"}
          </button>
        </form>

        <p className="mt-2 text-sm text-gray-500">
          Ex.: https://qtoon.com/detail/c_12345 ou 12345
        </p>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        {(comicsLoading || comics.length > 0) && (
          <div className="mt-12 w-full max-w-4xl">
            <h2 className="mb-4 text-xl font-semibold text-gray-200">
              Carregados anteriormente
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {comicsLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex flex-col overflow-hidden rounded-lg border border-gray-800 bg-gray-900"
                    >
                      <div className="aspect-[3/4] w-full animate-pulse bg-gray-800" />
                      <div className="space-y-2 p-3">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-gray-800" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-gray-800" />
                      </div>
                    </div>
                  ))
                : comics.map((comic) => (
                    <button
                      key={comic.id}
                      onClick={() => navigate(`/comic/${comic.id}`)}
                      className="group flex flex-col overflow-hidden rounded-lg border border-gray-800 bg-gray-900 text-left transition hover:border-purple-500"
                    >
                      {comic.cover_url ? (
                        <img
                          src={`/api/proxy/image?url=${encodeURIComponent(comic.cover_url)}`}
                          alt={comic.title}
                          className="aspect-[3/4] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[3/4] w-full items-center justify-center bg-gray-800 text-gray-500">
                          No cover
                        </div>
                      )}
                      <div className="p-3">
                        <p className="line-clamp-2 text-sm font-medium text-gray-100 group-hover:text-purple-300">
                          {comic.title}
                        </p>
                        {comic.author && (
                          <p className="mt-1 text-xs text-gray-500">
                            {comic.author}
                          </p>
                        )}
                        {comic.total_chapters != null && (
                          <p className="mt-1 text-xs text-gray-500">
                            {comic.total_chapters} chapters
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
