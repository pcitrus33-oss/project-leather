import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { UPLOADS_DIR, CLIENT_DIST } from './paths.js';
import { api } from './routes.js';

const PORT = Number(process.env.PORT ?? 3001);
const app = express();

app.use(express.json());
app.use('/api', api);
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));

// After `npm run build`, the server also serves the finished site.
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// Bound to localhost only: the site is private to this computer.
app.listen(PORT, '127.0.0.1', () => console.log(`🌍 API ready on http://localhost:${PORT}`));
