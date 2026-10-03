# ✈️ Project Leather

*(Placeholder name until the real one is chosen.)*

A personal photo portfolio organised by **place**, not time. Spin the cartoon globe, click a white (unlocked) country to see its photos, and use **🔓 Unlock a country** to add photos somewhere new.

## Run it

```
cd "D:\Project Leather"
npm run dev
```

Then open **http://localhost:5173**. Stop it with `Ctrl+C`.

`npm run dev` starts two copies of the site from the same code:

| Site | Address | Photos |
|---|---|---|
| **Your portfolio** | http://localhost:5173 | your real photos (`data/`) |
| **🛠️ Developer site** | http://localhost:5174 | a separate sandbox (`data-dev/`) for testing |

The Developer site has its own photos, so experimenting there never touches your real portfolio. Its **⚙️ Settings** page has developer tools:
- **Show everything:** see the whole globe as if every country, province and city were unlocked (display only).
- **Add sample photos** and **Clear sandbox**.

Both sites only listen on this computer (`localhost`), so no one else can reach them.

## Where your photos live

Everything is in the `data/` folder:

- `data/app.db` — which countries are unlocked, photo order, captions, places, covers, themes and settings (SQLite)
- `data/uploads/original/` — your untouched original files
- `data/uploads/web/` — resized copies for the full-screen viewer
- `data/uploads/thumb/` — small copies for the grid and globe bubbles

**Back up the whole `data/` folder** to keep your portfolio safe.

## Using it

- **Globe:** drag to spin, scroll or pinch to zoom, and hover a country to see its name. It spins slowly on its own until you touch it. Zoomed out you look straight down; as you zoom in, the view tilts (down to 55° from the surface) so you look across the land.
- **Menu:** the tab on the right edge slides out the menu: Countries visited, Photos uploaded, 🔓 Unlock a country and ⚙️ Settings. It tucks itself away again when you move off it.
- **Globe view** (in Settings):
  - **Day:** the whole globe lit.
  - **Day/Night cycle:** real-time day and night for right now. The night side is shaded gray (lighter as you zoom in), and places there glow.
- **Unlocked countries** turn white; locked countries stay gray. Large lakes (3,000 km² and up) are always shown.
- **Cities** (unlocked countries only): little cartoon skyscrapers on the big cities, and a taller tower with the country's flag on a pole for the capital. Capital names appear as you zoom in; other city names appear when you zoom closer.
- **Provinces (USA, Canada, China):** zoom in and these countries split into states/provinces. Each one is unlocked on its own (white when it has photos, gray when not) and has its own photo page. Each province's capital gets a medium tower with a gold dome.
- **Places on the globe:** when you tag a photo with a place the globe doesn't show yet, it gets a symbol: a skyscraper for cities, a tree for parks, a mountain, a beach umbrella, waves for water, an island, a museum, a castle for landmarks, a plane for airports, or a pin for anything else.
- **Photo bubbles:** sit on a little stem rising out of each place you've tagged, plus one in the middle of the country (or province) for photos without a place. Clicking any of them opens its page. To keep the globe tidy there are never more than 20: with more places, the 10 most recent plus 10 others picked at random each time.
- **Gray country:** click it, then **Add photos** to unlock it.
- **White country or photo bubble:** click it to fly in and open that country's page.
- **USA / Canada / China page:** a list of the states/provinces you've unlocked, each with a thumbnail. Click one to open its photo page, which has buttons back to the globe or to the country. 📸 Add photos asks which state/province the photos belong to.
- **Country page:**
  - Click a photo to view it full screen. Arrow keys move between photos and Esc closes.
  - **✏️ Edit layout** lets you drag to rearrange, ⭐ choose the photo shown on the globe, 📍 tag where each photo was taken, add captions, and 🗑️ delete. Then press **💾 Save**.
  - **Places:** search any city, landmark or address within the country. You can also set one place for a whole batch in the upload window. Place search uses OpenStreetMap, so it needs internet, and the search text is sent to OpenStreetMap. Your photos never leave your computer.
  - **🎨 Theme** switches how this country's photos are shown:
    - **Classic:** big tilted polaroids.
    - **Airplane:** photos through airplane windows, three across. There's always at least a 3×3 cabin, and empty windows show blue sky.
  - Deleting a country's last photo locks it again.
- **⚙️ Settings** (in the menu): choose the globe view, and the default theme that newly unlocked countries start with. Countries you've already unlocked keep their own theme.

## Project layout

```
client/   React + Vite website (globe: react-globe.gl / three.js)
  src/pages/        GlobePage, CountryPage, SettingsPage
  src/components/   Globe, UnlockModal, PhotoGrid, AirplaneGallery, ThemePicker, …
  src/lib/          api.ts (server calls), countries.ts (map data), themes.ts (theme list)
  src/data/         countries.json, cities.json, lakes.json, provinces.json (generated by scripts/)
server/   Express API + SQLite + sharp (image resizing)
  src/routes.ts     all /api endpoints
scripts/  build-borders / build-cities / build-lakes / build-provinces .mjs: regenerate the map data
data/     your photos + database (not code; back this up)
data-dev/ the Developer site's sandbox photos + database (safe to delete)
```

## Production-style run (optional)

```
npm run build
npm start
```

This serves the finished site and API together at http://localhost:3001.
