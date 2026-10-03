import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import type { Db } from './db';
import { childRoutes } from './routes/child';
import { adminRoutes } from './routes/admin';

// API の部分（画面の配信と起動は index.ts）
export function createApp(db: Db, opts: { sessionSecret: string; csp: boolean }) {
  const app = express();
  app.set('trust proxy', 1); // Render の前段（HTTPS）を信頼して、Cookie の Secure を正しく付ける
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser(opts.sessionSecret));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (opts.csp) {
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self' https://www.youtube.com",
          'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
          "img-src 'self' data: https://i.ytimg.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          'font-src https://fonts.gstatic.com',
          "connect-src 'self'",
        ].join('; '),
      );
    }
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/admin', adminRoutes(db));
  app.use('/api', childRoutes(db));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api]', err);
    res.status(500).json({ error: 'うまくいきませんでした。少し待ってから、もう一度ためしてね。' });
  });
  return app;
}
