import { existsSync } from 'node:fs';

// 手元では .env を読む（Render では管理画面の環境変数を使う）
if (existsSync('.env')) process.loadEnvFile('.env');

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`環境変数 ${name} が設定されていません`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  // tsx で .ts を直接動かしているときは開発モード、ビルド後の .js なら本番モード
  isProd: !import.meta.url.endsWith('.ts'),
  databaseUrl: process.env.DATABASE_URL ?? '',
  anthropicKey: required('ANTHROPIC_API_KEY'),
  model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-5',
  adminPassword: required('ADMIN_PASSWORD'),
  sessionSecret: required('SESSION_SECRET'),
};
