# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Run both frontend and backend concurrently
npm run dev

# Run individually
cd backend && npm run dev   # Backend on :3001 (tsx watch)
cd frontend && npm run dev  # Frontend on :5173 (Vite)
```

### Build
```bash
npm run build               # Builds both sequentially
cd backend && npm run build # tsc only
cd frontend && npm run build # tsc -b && vite build
```

### Environment
The backend requires a `GEMINI_API_KEY` in `.env` (root or backend dir). Without it, the server exits on startup.

### Cache management
To force re-translation of a chapter, either:
- Call `POST /api/manga/:comicId/chapters/:chapterId/translate?force=true`
- Or delete rows directly: `DELETE FROM translations WHERE chapter_id = X`

## Architecture

This is a monorepo with `backend/` and `frontend/` workspaces. There are no tests.

### Request Flow
1. User pastes a QToon URL or ID in the frontend
2. Backend scrapes the QToon page — extracts `__NUXT_DATA__` script (Nuxt 3 SSR payload) to get manga metadata and chapter list
3. Chapter image URLs are fetched from QToon's internal API and AES-128-CBC decrypted (keys hardcoded in scraper)
4. Translation is triggered per-chapter: images are resized to max 768px wide (WebP via `sharp`) then sent to **Gemini 2.5 Flash Lite** as base64 with a prompt requesting JSON with bounding boxes, original text, and `pt-BR` translations
5. Results are cached in SQLite; frontend polls `/status` until complete
6. Reader displays translations in two modes: **Panel** (side panel) or **Overlay** (absolute-positioned divs over images)

### Backend API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/manga` | List all cached comics |
| POST | `/api/manga/load` | Scrape and cache a comic by URL/ID |
| GET | `/api/manga/:comicId/chapters` | List chapters |
| POST | `/api/manga/:comicId/chapters/:chapterId/translate` | Start translation (async). `?force=true` retries failures |
| GET | `/api/manga/:comicId/chapters/:chapterId/status` | Poll job progress |
| GET | `/api/manga/:comicId/chapters/:chapterId/images` | Get images + cached translations. `?refresh=true` re-scrapes image URLs |
| GET | `/api/proxy/image?url=` | Proxy image from `resource.qqtoon.com` (whitelisted) |

### Key Architectural Points

**Scraper** (`backend/src/scraper/`): Tightly coupled to QToon's HTML structure. `qtoonScraper.ts` extracts Nuxt payload, decrypts CDN URLs with AES-128-CBC, and signs API requests with MD5-based device ID. Changes to QToon's frontend will break this.

**Gemini client** (`backend/src/translator/geminiClient.ts`): Fetches each image, resizes it to max 768px wide (preserving aspect ratio, no upscaling) and converts to WebP at quality 85 using `sharp`, then sends as base64 to `gemini-2.5-flash-lite`. Returns structured JSON with position data as percentages (0–100) relative to image dimensions. Has retry logic with exponential backoff; rate-limit (429) waits longer. Response parsing is in `parseResponse.ts` — strips markdown fences before `JSON.parse`.

**Translation concurrency**: `p-limit` caps at 10 parallel Gemini requests per chapter. Job progress is tracked in memory (`services/translationJobs.ts`) — not persisted across server restarts.

**Image proxy** (`backend/src/routes/proxy.ts`): Proxies images from `resource.qqtoon.com` only (whitelisted). Required because QToon CDN blocks direct browser requests.

**Database** (`backend/src/db/`): SQLite with foreign keys enabled. Three tables: `comics`, `chapters`, `translations`. `overlay_data` column stores the full JSON array of `TranslationEntry` objects (positions + text). `repositories.ts` uses prepared statements throughout.

**Frontend routing** (`frontend/src/App.tsx`): Three routes — `/` (InputPage), `/comic/:id` (ComicDetailPage), `/comic/:id/read/:chapterId` (ReaderPage).

**Frontend API** (`frontend/src/api/client.ts`): Single file with all typed API functions. Vite proxies `/api/*` to `http://localhost:3001` in dev.

**Overlay rendering** (`frontend/src/components/ImageOverlay.tsx`): Each translation entry is rendered as an absolute-positioned div using percentage-based coordinates from Gemini's response. Font size is calculated dynamically from balloon area and text length. Uses ResizeObserver to adapt to container width changes.

**Read history** (`frontend/src/hooks/useReadHistory.ts`): localStorage-based; tracks which chapters were read and when, used for "Continue reading" on the comic detail page.

**PWA**: Frontend is configured as a PWA via `vite-plugin-pwa` with auto-update. Images are cached for 30 days (CacheFirst), API responses for 24h (NetworkFirst).

### Note: `manga-reader/` subdirectory
There is a `manga-reader/` subdirectory at the repo root that is a stale copy of the project. Ignore it — all active code is in `backend/` and `frontend/`.

### TranslationEntry type (shared shape)
```ts
{
  original: string;
  translated: string;
  position: { x: number; y: number; width: number; height: number }; // percentages
  shape: "ellipse" | "rectangle" | "cloud";
  type: "bubble" | "sfx" | "narration";
}
```

### Database Schema
```sql
comics    (id, source, source_id, title, author, cover_url, total_chapters, serial_status)
chapters  (id, comic_id→comics, source_episode_id, title, chapter_number, is_free, image_urls JSON)
translations (id, chapter_id→chapters, image_index, original_url, overlay_data JSON, model_used, target_lang)
```
