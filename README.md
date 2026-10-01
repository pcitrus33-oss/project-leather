# 🌍 My Globe

A personal photo portfolio organised by **place**, not time. Spin the cartoon globe, click a white (unlocked) country to see its photos, and use **🔓 Unlock a country** to add photos somewhere new.

## Run it

```
cd "D:\Project Leather"
npm run dev
```

Then open **http://localhost:5173**. Stop it with `Ctrl+C`.

- `npm run dev` starts both halves: the photo server (port 3001) and the website (port 5173).
- The site only listens on this computer (`localhost`), so no one else can reach it.

## Where your photos live

Everything is in the `data/` folder:

- `data/app.db` — which countries are unlocked, photo order, captions and covers (SQLite)
- `data/uploads/original/` — your untouched original files
- `data/uploads/web/` — resized copies for the full-screen viewer
- `data/uploads/thumb/` — small copies for the grid and globe bubbles

**Back up the whole `data/` folder** to keep your portfolio safe.

## Using it

- **Globe:** drag to spin, scroll or pinch to zoom, and hover a country to see its name. It spins slowly on its own until you touch it.
- **Gray country:** click it, then **Add photos** to unlock it.
- **White country or photo bubble:** click it to fly in and open that country's page.
- **Country page:**
  - Click a photo to view it full screen. Arrow keys move between photos and Esc closes.
  - **✏️ Edit layout** lets you drag to rearrange, ⭐ choose the photo shown on the globe, add captions, and 🗑️ delete. Then press **💾 Save**.
  - Deleting a country's last photo locks it again.

## Project layout

```
client/   React + Vite website (globe: react-globe.gl / three.js)
  src/pages/        GlobePage, CountryPage
  src/components/   Globe, UnlockModal, PhotoGrid, CountrySilhouette, Flag
  src/lib/          api.ts (server calls), countries.ts (map data), celebrate.ts (confetti)
server/   Express API + SQLite + sharp (image resizing)
  src/routes.ts     all /api endpoints
data/     your photos + database (not code; back this up)
```

## Production-style run (optional)

```
npm run build
npm start
```

This serves the finished site and API together at http://localhost:3001.
