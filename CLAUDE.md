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

## Architecture

This is a monorepo with `backend/` and `frontend/` workspaces. There are no tests.

### Request Flow
1. User pastes a QToon URL or ID in the frontend
2. Backend scrapes the QToon page — extracts `__NUXT_DATA__` script (Nuxt 3 SSR payload) to get manga metadata and chapter list
3. Chapter image URLs are fetched from QToon's internal API and AES-128-CBC decrypted
4. Translation is triggered per-chapter: each image is sent to **Gemini 2.5 Flash** (as base64) with a prompt requesting JSON with bounding boxes, original text, and `pt-BR` translations
5. Results are cached in SQLite; frontend polls `/status` until complete
6. Reader displays translations in two modes: **Panel** (side panel) or **Overlay** (absolute-positioned divs over images)

### Key Architectural Points

**Scraper** (`backend/src/scraper/`): Tightly coupled to QToon's HTML structure. `qtoonScraper.ts` extracts Nuxt payload and decrypts CDN URLs. Changes to QToon's frontend will break this.

**Gemini client** (`backend/src/translator/geminiClient.ts`): Sends each manga panel image as base64 + prompt. Returns structured JSON with position data as percentages (0–100) relative to image dimensions. Has retry logic with exponential backoff.

**Translation concurrency**: `p-limit` caps at 10 parallel Gemini requests per chapter. Job progress is tracked in memory (`services/translationJobs.ts`) — not persisted across server restarts.

**Image proxy** (`backend/src/routes/proxy.ts`): Proxies images from `resource.qqtoon.com` only (whitelisted). Required because QToon CDN blocks direct browser requests.

**Database** (`backend/src/db/`): SQLite with WAL mode. Three tables: `comics`, `chapters`, `translations`. `overlay_data` column stores the full JSON array of `TranslationEntry` objects (positions + text). `repositories.ts` uses prepared statements throughout.

**Frontend API** (`frontend/src/api/client.ts`): Single file with all typed API functions. Vite proxies `/api/*` to `http://localhost:3001` in dev.

**Overlay rendering** (`frontend/src/components/ImageOverlay.tsx`): Each translation entry is rendered as an absolute-positioned div using percentage-based coordinates from Gemini's response. Font size is calculated dynamically from balloon area and text length.

### TranslationEntry type (shared shape)
```ts
{
  original: string;
  translated: string;
  position: { x: number; y: number; width: number; height: number }; // percentages
  shape: "ellipse" | "rectangle" | "cloud";
  type: string; // "dialogue", "sfx", etc.
}
```
