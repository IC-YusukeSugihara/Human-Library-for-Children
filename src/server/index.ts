import path from 'node:path';
import express from 'express';
import { env } from './env';
import { ensureSchema, openDb, seedVideos } from './db';
import { createApp } from './app';

const db = await openDb(env.databaseUrl, '.pglite');
await ensureSchema(db);
const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from kansha_videos`);
if (n === 0) console.log(`[db] 初期データを入れました：動画 ${await seedVideos(db)} 本`);
console.log(`[db] ${db.kind === 'postgres' ? 'Supabase（DATABASE_URL）' : '手元の仮DB（.pglite）'} に接続しました`);

const app = createApp(db, { sessionSecret: env.sessionSecret, csp: env.isProd });

if (env.isProd) {
  const dir = path.resolve(process.cwd(), 'dist/client');
  app.use(express.static(dir, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dir, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(env.port, '0.0.0.0', () => {
  console.log(`[server] http://localhost:${env.port}  （管理画面：/admin）`);
});
