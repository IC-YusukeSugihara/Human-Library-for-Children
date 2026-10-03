// Supabase（DATABASE_URL）に kansha_ の表を作り、動画の初期データを入れる。
// 何度実行しても同じ結果になる。既存の（kansha_ 以外の）表には触れない。
//   pnpm db:setup          … 表の作成と初期データ
//   pnpm db:setup --check  … 接続して、kansha_ の表があるかを見るだけ
import { existsSync } from 'node:fs';
import { ensureSchema, openDb, seedVideos } from '../src/server/db';

if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL が .env にありません');
  process.exit(1);
}

const db = await openDb(url);
const tables = async () =>
  (
    await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name like 'kansha\\_%' order by table_name`,
    )
  ).map((t) => t.table_name);

const [{ version }] = await db.query<{ version: string }>('select version()');
console.log('接続できました:', version.split(' ').slice(0, 2).join(' '));
console.log('いまある kansha_ の表:', (await tables()).join(', ') || '（なし）');

if (!process.argv.includes('--check')) {
  await ensureSchema(db);
  const added = await seedVideos(db);
  console.log('表を作成しました:', (await tables()).join(', '));
  console.log(`動画の初期データ：${added} 本を追加（すでにある動画はそのまま）`);
  const rows = await db.query<{ review_status: string; n: number }>(
    `select review_status, count(*)::int as n from kansha_videos group by review_status order by review_status`,
  );
  console.log('kansha_videos:', rows.map((r) => `${r.review_status} ${r.n}`).join(' / '));
}
await db.close();
