import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// DB への接続。本番は Supabase の Postgres に直接つなぐ（DATABASE_URL）。
// DATABASE_URL がないときは、手元で同じ SQL が動く埋め込み Postgres（PGlite）を使う。

export interface Queryable {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  kind: 'postgres' | 'pglite';
  exec(sql: string): Promise<void>;
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const DATE_OID = 1082;

export async function openDb(databaseUrl: string, pgliteDir?: string): Promise<Db> {
  if (databaseUrl) return openPostgres(databaseUrl);
  return openPglite(pgliteDir);
}

function openPostgres(url: string): Db {
  // 日付（date 型）は「2026-10-03」の文字列のまま扱う（タイムゾーンでずれないように）
  pg.types.setTypeParser(DATE_OID, (v) => v);
  const u = new URL(url);
  u.searchParams.delete('sslmode');
  const isLocal = ['localhost', '127.0.0.1'].includes(u.hostname);
  const pool = new pg.Pool({
    connectionString: u.toString(),
    max: 4,
    idleTimeoutMillis: 30_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  pool.on('error', (err) => console.error('[db] 接続エラー', err.message));
  return {
    kind: 'postgres',
    async query(sql, params) {
      const r = await pool.query(sql, params as any[]);
      return r.rows;
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const out = await fn({
          async query(sql, params) {
            return (await client.query(sql, params as any[])).rows;
          },
        });
        await client.query('commit');
        return out;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function openPglite(dir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(dir, { parsers: { [DATE_OID]: (v: string) => v } });
  const wrap = (q: { query: (s: string, p?: any[]) => Promise<{ rows: any[] }> }): Queryable => ({
    async query(sql, params) {
      return (await q.query(sql, params as any[])).rows;
    },
  });
  // PGlite は1本の接続なので、トランザクションが重ならないよう順番に流す
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  return {
    kind: 'pglite',
    query: (sql, params) => serial(() => wrap(db).query(sql, params)),
    exec: (sql) => serial(async () => void (await db.exec(sql))),
    tx: (fn) => serial(() => db.transaction((t) => fn(wrap(t)))),
    close: () => db.close(),
  };
}

export async function ensureSchema(db: Db): Promise<void> {
  const sql = readFileSync(path.resolve(process.cwd(), 'db/schema.sql'), 'utf8');
  await db.exec(sql);
}

interface SeedVideo {
  id: string;
  url: string;
  title: string;
  summary: string;
  cat: string;
  is_infra: boolean;
  kind: string;
  channel: string;
  length: string;
  job: string;
  memo: string;
  review_status: 'pending' | 'approved' | 'rejected';
  order: number;
}

// 13章：seed_videos.json を kansha_videos に入れる。すでにある動画は上書きしない（審査結果を守るため）。
export async function seedVideos(db: Db): Promise<number> {
  const list: SeedVideo[] = JSON.parse(readFileSync(path.resolve(process.cwd(), 'seed_videos.json'), 'utf8'));
  const rows = await db.query(
    `insert into kansha_videos (id, url, title, summary, cat, is_infra, kind, channel, length, job, memo, review_status, sort_order)
     select id, url, title, summary, cat, is_infra, kind, channel, length, job, memo, review_status, "order"
     from jsonb_to_recordset($1::jsonb) as x(
       id text, url text, title text, summary text, cat text, is_infra boolean, kind text, channel text,
       length text, job text, memo text, review_status text, "order" integer)
     on conflict (id) do nothing returning id`,
    [JSON.stringify(list)],
  );
  return rows.length;
}
