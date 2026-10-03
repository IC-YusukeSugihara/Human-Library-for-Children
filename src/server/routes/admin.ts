import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { Db } from '../db';
import { env } from '../env';
import { clearAdmin, isAdmin, requireAdmin, setAdmin } from '../session';
import { ruleFor } from '../ai/judge';
import { AGE_LABEL, type AgeGroup } from '../../shared/types';
import { INFRA_CATS } from '../../shared/genres';
import { buildPlanetMap } from '../planetMap';
import { formatCode, newCode } from '../invites';
import { mapLimit, oembed, parseVideoId } from '../youtube';

const sha = (s: string) => createHash('sha256').update(s).digest();

// パスワードの総当たりを防ぐ：10分に10回まで
const attempts = new Map<string, { n: number; until: number }>();

export function adminRoutes(db: Db): Router {
  const r = Router();

  r.post('/login', (req, res) => {
    const ip = req.ip ?? 'unknown';
    const a = attempts.get(ip);
    if (a && a.until > Date.now() && a.n >= 10) {
      res.status(429).json({ error: 'しばらく待ってから、もう一度試してください' });
      return;
    }
    const ok = timingSafeEqual(sha(String(req.body?.password ?? '')), sha(env.adminPassword));
    if (!ok) {
      const cur = a && a.until > Date.now() ? a : { n: 0, until: Date.now() + 10 * 60 * 1000 };
      cur.n++;
      attempts.set(ip, cur);
      res.status(401).json({ error: 'パスワードがちがいます' });
      return;
    }
    attempts.delete(ip);
    setAdmin(req, res);
    res.json({ ok: true });
  });

  r.post('/logout', (_req, res) => {
    clearAdmin(res);
    res.json({ ok: true });
  });

  r.get('/me', (req, res) => {
    res.json({ admin: isAdmin(req) });
  });

  r.use(requireAdmin);

  // 5.1 承認待ち（AIが迷ったコメント）
  r.get('/pending', async (_req, res) => {
    const rows = await db.query<{ id: string; age_group: AgeGroup; created_at: string; video_title: string; text: string; reason: string; question: string | null; ai_failed: boolean }>(
      `select c.id, u.age_group, c.created_at, v.title as video_title, c.text, c.reason, c.question, c.ai_failed
       from kansha_comments c join kansha_users u on u.id = c.user_id join kansha_videos v on v.id = c.video_id
       where c.status = 'pending' order by c.created_at`,
    );
    const decided = await db.query<{ id: string; text: string; status: string; decided_at: string }>(
      `select id, text, status, decided_at from kansha_comments
       where status in ('approved', 'rejected') and decided_at is not null order by decided_at desc limit 30`,
    );
    res.json({
      pending: rows.map((x) => ({ ...x, age: AGE_LABEL[x.age_group], rule: ruleFor(x.age_group) })),
      decided,
    });
  });

  r.post('/comments/:id/decide', async (req, res) => {
    const approve = req.body?.approve === true;
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const rows = await db.query(
      `update kansha_comments
       set status = $2, decided_at = now(), notified_at = null, question = coalesce(nullif($3, ''), question)
       where id = $1 and status = 'pending' returning id`,
      [req.params.id, approve ? 'approved' : 'rejected', approve ? '' : question],
    );
    if (!rows.length) {
      res.status(409).json({ error: 'すでに処理されています' });
      return;
    }
    res.json({ ok: true });
  });

  // 5.2 テーマのつながり
  r.get('/map', async (_req, res) => {
    const paths = (await db.query<{ path: string[] }>(`select path from kansha_selections`)).map((x) => x.path);
    const days = (await db.query<{ answers: unknown }>(`select answers from kansha_days where selected_at is not null`)).map((x) => x.answers);
    const cats = new Set((await db.query<{ cat: string }>(`select distinct cat from kansha_videos`)).map((x) => x.cat));
    res.json(buildPlanetMap(paths, days, cats));
  });

  // 5.3 動画審査
  r.get('/videos', async (_req, res) => {
    const rows = await db.query(
      `select id, url, title, summary, cat, is_infra, kind, channel, length, job, memo, review_status, available, checked_at, sort_order
       from kansha_videos order by sort_order, created_at`,
    );
    res.json({ videos: rows });
  });

  r.post('/videos/:id/status', async (req, res) => {
    const status = String(req.body?.status ?? '');
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      res.status(400).json({ error: '状態の指定がちがいます' });
      return;
    }
    const rows = await db.query(
      `update kansha_videos set review_status = $2, decided_at = case when $2 = 'pending' then null else now() end
       where id = $1 returning id`,
      [req.params.id, status],
    );
    if (!rows.length) {
      res.status(404).json({ error: '動画が見つかりません' });
      return;
    }
    res.json({ ok: true });
  });

  // 5.3【提案】URLとジャンルを入れて未審査に追加
  r.post('/videos', async (req, res) => {
    const id = parseVideoId(String(req.body?.url ?? ''));
    const cat = String(req.body?.cat ?? '').trim();
    if (!id) {
      res.status(400).json({ error: 'YouTube の動画URLを入れてください' });
      return;
    }
    if (!cat) {
      res.status(400).json({ error: 'ジャンルを入れてください' });
      return;
    }
    const [exists] = await db.query(`select review_status from kansha_videos where id = $1`, [id]);
    if (exists) {
      res.status(409).json({ error: 'この動画はすでに登録されています' });
      return;
    }
    const info = await oembed(id);
    const [{ next }] = await db.query<{ next: number }>(`select coalesce(max(sort_order), 0) + 1 as next from kansha_videos`);
    await db.query(
      `insert into kansha_videos (id, url, title, cat, is_infra, channel, review_status, sort_order, available, checked_at)
       values ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, case when $8::boolean is null then null else now() end)`,
      [
        id,
        `https://www.youtube.com/watch?v=${id}`,
        info.title ?? '（タイトル未取得）',
        cat,
        INFRA_CATS.includes(cat),
        info.author ?? '',
        next,
        info.status === null ? null : info.status === 200,
      ],
    );
    res.json({ ok: true, id, title: info.title ?? null, available: info.status === null ? null : info.status === 200 });
  });

  // 5.4 動画の確認ボタン：承認済みの全動画が今も見られるか確かめる
  r.post('/videos/check', async (_req, res) => {
    const list = await db.query<{ id: string; title: string }>(
      `select id, title from kansha_videos where review_status = 'approved' order by sort_order`,
    );
    const results = await mapLimit(list, 6, async (v) => ({ ...v, ...(await oembed(v.id)) }));
    for (const x of results) {
      if (x.status === null) continue; // 通信できなかったものは、結果を変えない
      await db.query(`update kansha_videos set available = $2, checked_at = now() where id = $1`, [x.id, x.status === 200]);
    }
    res.json({
      checked: results.filter((x) => x.status !== null).length,
      total: results.length,
      unavailable: results.filter((x) => x.status !== null && x.status !== 200).map((x) => ({ id: x.id, title: x.title, status: x.status })),
      failed: results.filter((x) => x.status === null).map((x) => ({ id: x.id, title: x.title })),
    });
  });

  // 5.5 招待コード
  r.get('/invites', async (_req, res) => {
    const rows = await db.query<{ code: string; note: string; created_at: string; used_at: string | null; nickname: string | null }>(
      `select i.code, i.note, i.created_at, i.used_at, u.nickname
       from kansha_invites i left join kansha_users u on u.id = i.used_by
       order by i.created_at desc`,
    );
    res.json({ invites: rows.map((x) => ({ ...x, display: formatCode(x.code) })) });
  });

  r.post('/invites', async (req, res) => {
    const count = Math.max(1, Math.min(20, Number(req.body?.count) || 1));
    const note = String(req.body?.note ?? '').trim().slice(0, 100);
    const created: string[] = [];
    while (created.length < count) {
      const code = newCode();
      const rows = await db.query(`insert into kansha_invites (code, note) values ($1, $2) on conflict do nothing returning code`, [code, note]);
      if (rows.length) created.push(formatCode(code));
    }
    res.json({ created });
  });

  return r;
}
