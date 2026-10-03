# Human Library for Children（試作）

1日を振り返る質問に答えると、その日の暮らしを支える仕事をしている人の動画が表示され、見たあとに感謝を言葉にするウェブアプリの試作です。仕様は [SPEC.md](SPEC.md)。

- 子どもの画面：`/`（招待コードで登録）
- 管理画面：`/admin`（環境変数 `ADMIN_PASSWORD` で入る）

## 構成

- 画面：React + Vite + TypeScript（`src/client`）
- サーバー：Node.js + Express（`src/server`）。画面から DB には直接触れず、すべてサーバー経由
- DB：Supabase の既存プロジェクトに `kansha_` で始まる表を追加（`db/schema.sql`）。サーバーは `DATABASE_URL` で Postgres に直接つなぐ
- AI：Claude API（`claude-sonnet-5`）。動画の選定（7章）とコメント判定（8章）。キーはサーバー側だけで使う

## 環境変数（.env）

| 名前 | 内容 |
|---|---|
| `DATABASE_URL` | Supabase の接続文字列（Connect →「Session pooler」） |
| `ANTHROPIC_API_KEY` | Claude API のキー |
| `ADMIN_PASSWORD` | 管理画面のパスワード |
| `SESSION_SECRET` | Cookie の署名に使う長いランダムな文字列 |
| `CLAUDE_MODEL` | 省略時 `claude-sonnet-5` |

`SUPABASE_URL`・`SUPABASE_SERVICE_KEY` は今は使っていません（REST API を通さず、Postgres に直接つなぐため）。

`DATABASE_URL` がないときは、手元の仮DB（`.pglite/` に保存される埋め込み Postgres）で動きます。

## 手元で動かす

```bash
pnpm install
pnpm db:setup      # Supabase に kansha_ の表を作り、動画117本を入れる（何度実行してもよい）
pnpm dev           # http://localhost:3000
```

本番と同じ形で動かすときは `pnpm build` のあと `pnpm start`。

## 確認

```bash
pnpm run check     # 型チェック＋テスト（push する前に自動で実行されます）
```

テストは埋め込み Postgres の上で API を通しで動かし、15章の確認の基準（登録、小さな泡、10本の選定ルール、メーター、承認、動画の確認 など）を確かめます。AI と YouTube への問い合わせはテストでは差し替えています。

## Render に置く

1. Render で「New → Blueprint」を選び、このリポジトリを指定する（`render.yaml` を読みます）
2. 環境変数 `DATABASE_URL`・`ANTHROPIC_API_KEY`・`ADMIN_PASSWORD`・`SESSION_SECRET` を入れる
3. 起動時に表がなければ作り、動画が0本なら初期データを入れます

無料プランは15分操作がないと止まり、次に開くとき1分ほど待ちます。
