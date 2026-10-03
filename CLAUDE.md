# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Project Leather" (a placeholder name; the user will choose the real one later): a **single-user, local-only** photo portfolio organised by country instead of time. It is deliberately *not* a social platform, so there are no accounts, feeds or sharing. The home page is a cartoon 3D globe: gray = locked country, white = unlocked (has photos), with photo "bubbles" on unlocked countries. Each country has its own page that shows its photos in that country's chosen **theme**, plus a drag-to-rearrange edit mode. The visual style should stay cute and cartoonish, never realistic.

## Commands

npm workspaces monorepo (`client/`, `server/`). Run these from the repo root:

```
npm run dev      # server (tsx watch, :3001) + Vite client (:5173) via concurrently; open http://localhost:5173
npm run build    # type-check + build client to client/dist
npm start        # server only; also serves client/dist if it exists → http://localhost:3001
```

Type-checking (there is no linter or test suite):

```
npx tsc -p client
npx tsc -p server
```

On this Windows machine, Node may be missing from the Bash tool's PATH. Prefix commands with `export PATH="/c/Program Files/nodejs:$PATH";` if `node`/`npm` aren't found.

## Architecture

**Data flow.** The Vite dev server proxies `/api` and `/uploads` to the Express server (`client/vite.config.ts`), so the client always uses relative URLs. The server binds to `127.0.0.1` only.

**Server (`server/src`)**
- `db.ts` uses Node's **built-in `node:sqlite`** (`DatabaseSync`), not better-sqlite3, so there is no native build. It has three tables:
  - `countries(iso, cover_photo_id, unlocked_at, theme)`
  - `photos(id, iso, original_ext, width, height, caption, sort_order, created_at, lat, lng, place)`: the place fields are optional and null until tagged.
  - `settings(key, value)`: currently only `default_theme`.
- **Schema changes** must be additive in-place migrations in `db.ts` (see how the `theme` column is added via `PRAGMA table_info`). The user's real database already exists, so never recreate it.
- Use the `transaction()` helper for multi-statement writes.
- A country is "unlocked" exactly when it has a `countries` row. Rows are created on first upload, and **deleting the last photo deletes the row (re-locks the country)**.
- If `cover_photo_id` is null, the cover falls back to the first photo by `sort_order`. Both the server (`/api/countries`) and the client (`CountryPage` `effectiveCover`) apply this rule.
- `images.ts`: sharp writes three variants under `data/uploads/{original,web,thumb}/`:
  - `original` is the untouched file with its original extension.
  - `web` (2048px) and `thumb` (640px) are EXIF-rotated JPEGs named `<uuid>.jpg`.
- `routes.ts` holds every `/api` endpoint. Country codes are validated by `ISO_RE`.
- **Places:** `/api/countries` returns, per country, `pins` (photos grouped by place, with rounded lat/lng) and `unplacedCount`. `/api/geocode` proxies OpenStreetMap Nominatim.
  - **Nominatim usage policy:** at most ~1 request/second (enforced server-side), an identifying User-Agent, search on submit rather than per keystroke, and an OSM credit shown in `LocationSearch`. Keep all four.
- **Themes:** each country stores its own theme, set to `defaultTheme()` when it is first unlocked. Changing the default never touches existing countries. Theme ids live in `THEME_IDS` (server/src/db.ts) and `THEMES` (client/src/lib/themes.ts). **Keep the two lists in sync.**
- `paths.ts` resolves `data/` relative to the repo root. `data/` holds the user's real photos and DB. It is git-ignored and must never be committed or wiped.

**Client (`client/src`)**
- `lib/countries.ts` builds the country list at load time from `src/data/countries.json`.
  - **Borders:** the file is the 1:50m Natural Earth borders simplified by `scripts/build-borders.mjs` to 70% of their points, with small countries (< 30,000 km²) kept whole. That loads and builds in ~1 s in the browser, which is the user's target. 1:110m isn't an option because it drops 64 small countries.
  - Countries are keyed by **ISO alpha-3** (via `i18n-iso-countries` numeric→alpha3). The `SPECIAL` map fixes shapes with missing or duplicate codes, e.g. Kosovo, and Ashmore & Cartier sharing Australia's id. Other code-less shapes get an `X-…` key.
  - Bubble position = centroid of the country's largest polygon.
- `components/Globe.tsx` wraps `react-globe.gl` (three.js). Non-obvious points:
  - **Countries are NOT a globe.gl polygon layer.** `lib/landMesh.ts` merges all 1,616 country pieces into one mesh plus one `LineSegments` of borders, added via `globe.scene()`. As separate polygons it was ~4,800 draw calls and ~10 fps on the user's Intel Iris Xe; merged it's ~70–90 fps.
    - **Hover:** a `pointermove` listener on the canvas, using `globe.toGlobeCoords` then `land.countryAt`. The tooltip is our own `.globe-tip-floating` div.
    - **Clicks:** `onGlobeClick` → `countryAt`, plus `onCustomLayerClick` for clicks on terrain.
    - **Colours:** `setColor` repaints a country's vertex range.
    - **Picking:** globe.gl only raycasts its own layers, so the merged mesh doesn't block picking.
  - **`lib/sphere.ts`** holds the shared geometry helpers. Use them instead of three-conic-polygon-geometry and d3 `geoContains`, both measured as far too slow here:
    - `toVector`/`toLatLng` match three-globe's coordinates.
    - `polygonTest`/`featureTest` is a fast flat point-in-polygon test, with a `geoContains` fallback for date-line rings.
    - `polygonSurface` builds flat polygon tops and sides with earcut, plus longest-edge subdivision so big triangles follow the curve.
  - **HTML bubbles:** globe.gl positions each element with its own CSS `transform`. Animations and hover sizing must go on the **inner** `.photo-bubble` button, never on the anchor element it returns.
  - **Callbacks:** bubble DOM is built by hand, so callbacks reach it through refs (`openRef`, `flyRef`).
  - **Clicking a country:** clicking an unlocked country or a bubble flies the camera there (`FLY_MS`), then navigates.
  - **Remembered view:** the camera position is kept in a module variable plus `sessionStorage` (`savePov`), so returning to `/` restores the same view.
  - **Clouds:** a plain three.js group added via `globe.scene()`.
  - **Terrain:** unlocked countries get a painted cartoon landscape (`lib/terrain.ts`), rendered as globe.gl's custom layer.
    - **Land:** flat land with noise-painted green "fields".
    - **Water:** lakes, and rivers as ribbons with darker edges, both from `src/data/water.json` (Natural Earth 1:50m, via `scripts/build-water.mjs`, loaded lazily).
    - **Mountains:** instanced low-poly cones with ink outlines (an inverted hull) and boulders, placed on a jittered grid wherever `elevation.png` exceeds `MOUNTAIN_MIN`. Snow above `SNOW_MIN`.
    - **Style the user asked for:** fully painted, gray rocky mountain sides, no height-based colour ramp, cartoon not realistic.
    - **Lighting:** a "sun" directional light follows the camera from the upper left. The default globe.gl light was fixed over the North Pole.
    - **Shadows:** cast by mountains (`SHADOWS_ENABLED`). Measured cost was negligible (~2%).
  - **Cities and bubbles** (cities only for unlocked countries; bubbles one per place pin plus one centre bubble for unplaced photos) share globe.gl's single HTML-element layer (`markers`, a `kind` union). `buildMarker` must stay a stable `useCallback`; otherwise every hover re-render rebuilds ~450 DOM elements.
  - **City names by zoom:** `handleZoom` toggles `show-capital-names` / `show-city-names` classes on the wrapper div directly, with no React state, so the globe doesn't re-render.
  - **City data:** `src/data/cities.json` is generated. Edit `scripts/build-cities.mjs` (size thresholds, `CAPITAL_OVERRIDE`, `MIN_GAP_KM`) and rerun `node scripts/build-cities.mjs` from the repo root rather than hand-editing the JSON.
  - **Type cast:** `polygonGeoJsonGeometry` needs an `as never` cast because the library's own GeoJSON types are too narrow.
- **Flags:** Windows can't render flag emoji. Use the `flag-icons` CSS through `<Flag>` or `flagHtml()` (the latter for raw-HTML contexts like globe tooltips).
- `pages/CountryPage.tsx` picks the view component by theme (`PhotoGrid` = classic, `AirplaneGallery` = airplane). Edit mode always uses the shared `EditablePhotoGrid`, whatever the theme.
  - **Edit mode** works on a local `draft` (order, captions, locations, cover). Save sends only the diffs: `PUT order`, `PATCH` captions and locations, `PUT cover`. Deletes happen immediately.
  - **Adding a theme:** add its id to both lists, write a gallery component, add a branch in `CountryPage` and a preview in `ThemePreview`.
- **Back button:** it uses `navigate(-1)` when `history.state.idx > 0`, so browser Back/Forward stay consistent.
- Uploads use XHR (`api.upload`) for progress events.
- Styling: plain CSS per component plus design tokens in `styles/theme.css` (`--ink`, `--pink`, `.btn`, `.card`, `.chip`, …). The font is Fredoka.

## Verifying UI changes

There are no automated tests. To check visuals, drive the installed Microsoft Edge headlessly with `playwright-core` (`channel: 'msedge'`, args `--use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL). Install it in a scratch directory, not in this repo.
- **Moving bubbles:** bubbles move (auto-spin and float), so trigger clicks via `element.click()` in `page.evaluate`.
- **Test data:** test uploads go into the real `data/`, so delete them through the API afterwards. The user has real photos there, so never delete anything you didn't create, and reset `default_theme` if you changed it.
- **Stale processes:** background dev servers from earlier sessions can survive and keep ports 3001/5173, which makes tests hit a stale app or hang. Before testing, check `Get-NetTCPConnection -LocalPort 3001,5173` and stop leftover `node` / headless `msedge` processes.
- **Git Bash paths:** Git Bash rewrites arguments like `/country/JPN` into Windows paths. Pass URL paths without the leading slash.
- **Auto-spin:** the globe auto-rotates, so screenshots drift from the requested view. Set `sessionStorage['globe-pov']` before load (addInitScript) to aim the camera. For hover/click tests, hover a point, read the tooltip, then click immediately (hovering a country pauses the spin).
- **Real performance numbers:** headless Edge can use the real GPU (`--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`), which gives the user's Intel Iris Xe frame rates. SwiftShader numbers (~0.5 fps) are meaningless. A bare WebGL canvas reaches ~144 fps there, so compare against that.
- **Starting the dev server for the user:** this session's PATH may predate the Node install. To open a terminal window for the user, rebuild `$env:Path` from the Machine and User values first, otherwise `npm` isn't found.
- **Shell quoting:** the Bash tool can choke on heredocs that mix apostrophes and backticks. Put multi-line edit scripts in a scratch file and run that.

## Workflow

- **Git:** the user wants every completed change committed with a clean, descriptive message and **pushed to GitHub**, so they can always revert. The remote is `origin` → `https://github.com/pcitrus33-oss/project-leather` (private), branch `main`. Keep commits small and logical. Releases are marked with tags like `v1.1`.
- **Image formats:** HEIC uploads aren't supported, because the prebuilt sharp can't decode them.
- **Deferred features:** EXIF GPS auto-country detection, city-level tags and a password-protected online deploy are planned for later. Don't build them unless asked.
