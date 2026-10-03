import { Router, type Request, type Response } from 'express';
import type { Db } from '../db';
import { childId, clearChild, setChild } from '../session';
import { dayKey } from '../../shared/day';
import { sanitizeAnswers, type Answers } from '../../shared/questions';
import { AGE_GROUPS, type AgeGroup, type CommentResult, type HistoryItem, type MeState } from '../../shared/types';
import { candidatesFor, meterOf, noticesFor, selectionFor } from '../store';
import { selectVideos } from '../ai/select';
import { judgeComment } from '../ai/judge';
import { normalizeCode } from '../invites';

const COMMENT_MAX = 400;
const COMMENTS_PER_DAY = 40; // AIの費用が増えすぎないための上限

export function childRoutes(db: Db): Router {
  const r = Router();

  async function currentUser(req: Request, res: Response) {
    const id = childId(req);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [u] = await db.query<{ id: string; nickname: string; age_group: AgeGroup }>(
      `select id, nickname, age_group from kansha_users where id = $1`,
      [id],
    );
    if (!u) clearChild(res);
    return u ?? null;
  }

  async function needUser(req: Request, res: Response) {
    const u = await currentUser(req, res);
    if (!u) res.status(401).json({ error: '登録してください' });
    return u;
  }

  r.get('/me', async (req, res) => {
    const day = dayKey();
    const u = await currentUser(req, res);
    if (!u) {
      const empty: MeState = { user: null, day, meter: 0, answers: null, selection: null, watchedToday: [], notices: [] };
      res.json(empty);
      return;
    }
    const [d] = await db.query<{ answers: Answers; selected_at: string | null }>(
      `select answers, selected_at from kansha_days where user_id = $1 and date = $2`,
      [u.id, day],
    );
    const watched = await db.query<{ video_id: string }>(
      `select video_id from kansha_views where user_id = $1 and date = $2 order by watched_at`,
      [u.id, day],
    );
    const me: MeState = {
      user: { nickname: u.nickname, age_group: u.age_group },
      day,
      meter: await meterOf(db, u.id),
      answers: d ? sanitizeAnswers(d.answers) : null,
      selection: d?.selected_at ? await selectionFor(db, u.id, day) : null,
      watchedToday: watched.map((w) => w.video_id),
      notices: await noticesFor(db, u.id),
    };
    res.json(me);
  });

  r.post('/invite/check', async (req, res) => {
    const code = normalizeCode(req.body?.code);
    const [inv] = await db.query<{ used_at: string | null }>(`select used_at from kansha_invites where code = $1`, [code]);
    if (!inv) res.json({ ok: false, message: 'このコードは見つかりませんでした。もう一度たしかめてね。' });
    else if (inv.used_at) res.json({ ok: false, message: 'このコードはもう使われています。' });
    else res.json({ ok: true });
  });

  r.post('/register', async (req, res) => {
    const code = normalizeCode(req.body?.code);
    const nickname = String(req.body?.nickname ?? '').trim();
    const age = req.body?.age_group as AgeGroup;
    if (!nickname || [...nickname].length > 20) {
      res.status(400).json({ error: 'ニックネームは1〜20文字で入れてね' });
      return;
    }
    if (!AGE_GROUPS.includes(age)) {
      res.status(400).json({ error: '年齢区分をえらんでね' });
      return;
    }
    if (req.body?.consent !== true) {
      res.status(400).json({ error: '同意のチェックが必要です' });
      return;
    }
    // 18歳未満は保護者がその場でチェック。大学生は試作では本人のチェックで代用（4.1）
    const consentBy = age === 'university' ? 'self' : 'guardian';
    const user = await db.tx(async (q) => {
      const claimed = await q.query(
        `update kansha_invites set used_at = now() where code = $1 and used_at is null returning code`,
        [code],
      );
      if (!claimed.length) return null;
      const [u] = await q.query<{ id: string }>(
        `insert into kansha_users (nickname, age_group, consent_at, consent_by) values ($1, $2, now(), $3) returning id`,
        [nickname, age, consentBy],
      );
      await q.query(`update kansha_invites set used_by = $1 where code = $2`, [u.id, code]);
      return u;
    });
    if (!user) {
      res.status(400).json({ error: 'このコードは使えません。もう一度たしかめてね。' });
      return;
    }
    setChild(req, res, user.id);
    res.json({ ok: true });
  });

  r.put('/today/answers', async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const day = dayKey();
    const answers = sanitizeAnswers(req.body?.answers);
    const rows = await db.query(
      `insert into kansha_days (user_id, date, answers) values ($1, $2, $3)
       on conflict (user_id, date) do update set answers = excluded.answers, updated_at = now()
       where kansha_days.selected_at is null
       returning date`,
      [u.id, day, JSON.stringify(answers)],
    );
    res.json({ ok: rows.length > 0 });
  });

  // 同じ子が「一覧へ」を続けて押しても、選定は1回だけ
  const selecting = new Map<string, Promise<unknown>>();

  r.post('/today/select', async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const day = dayKey();
    const run = async () => {
      const [d] = await db.query<{ answers: Answers; selected_at: string | null }>(
        `select answers, selected_at from kansha_days where user_id = $1 and date = $2`,
        [u.id, day],
      );
      if (d?.selected_at) return;
      const answers = sanitizeAnswers(req.body?.answers ?? d?.answers);
      const { cands, seen } = await candidatesFor(db, u.id);
      const result = await selectVideos(answers, cands, seen, `${u.id}:${day}`);
      await db.tx(async (q) => {
        await q.query(
          `insert into kansha_days (user_id, date, answers) values ($1, $2, $3)
           on conflict (user_id, date) do update set answers = excluded.answers, updated_at = now()`,
          [u.id, day, JSON.stringify(answers)],
        );
        const [locked] = await q.query<{ selected_at: string | null }>(
          `select selected_at from kansha_days where user_id = $1 and date = $2 for update`,
          [u.id, day],
        );
        if (locked?.selected_at) return;
        for (const [i, p] of result.picks.entries()) {
          await q.query(
            `insert into kansha_selections (user_id, date, video_id, rank, label, path, kind, is_fallback)
             values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [u.id, day, p.video_id, i + 1, p.label, JSON.stringify(p.path), p.kind, p.is_fallback],
          );
        }
        await q.query(`update kansha_days set selected_at = now() where user_id = $1 and date = $2`, [u.id, day]);
      });
    };
    let job = selecting.get(u.id);
    if (!job) {
      job = run().finally(() => selecting.delete(u.id));
      selecting.set(u.id, job);
    }
    await job;
    res.json({ selection: await selectionFor(db, u.id, day) });
  });

  r.post('/views', async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const videoId = String(req.body?.video_id ?? '');
    const [ok] = await db.query(`select 1 from kansha_selections where user_id = $1 and video_id = $2 limit 1`, [u.id, videoId]);
    if (!ok) {
      res.status(400).json({ error: 'この動画は選ばれていません' });
      return;
    }
    const day = dayKey();
    await db.query(
      `insert into kansha_views (user_id, video_id, date, is_first_of_day)
       values ($1, $2, $3, not exists (select 1 from kansha_views where user_id = $1 and date = $3))
       on conflict (user_id, video_id, date) do nothing`,
      [u.id, videoId, day],
    );
    const [v] = await db.query<{ is_first_of_day: boolean }>(
      `select is_first_of_day from kansha_views where user_id = $1 and video_id = $2 and date = $3`,
      [u.id, videoId, day],
    );
    res.json({ is_first_of_day: v?.is_first_of_day ?? false });
  });

  r.post('/comments', async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const videoId = String(req.body?.video_id ?? '');
    const text = String(req.body?.text ?? '').trim();
    if (!text || [...text].length > COMMENT_MAX) {
      res.status(400).json({ error: `コメントは1〜${COMMENT_MAX}文字で書いてね` });
      return;
    }
    const day = dayKey();
    const [video] = await db.query<{ title: string; summary: string; job: string }>(
      `select v.title, v.summary, v.job from kansha_videos v
       where v.id = $1 and exists (select 1 from kansha_views w where w.user_id = $2 and w.video_id = v.id)`,
      [videoId, u.id],
    );
    if (!video) {
      res.status(400).json({ error: '動画を見てから書いてね' });
      return;
    }
    const [{ n }] = await db.query<{ n: number }>(
      `select count(*)::int as n from kansha_comments where user_id = $1 and date = $2`,
      [u.id, day],
    );
    if (n >= COMMENTS_PER_DAY) {
      res.status(429).json({ error: '今日はたくさん書いてくれてありがとう。続きはまた明日ね。' });
      return;
    }
    // 9章：その日2本目以降の動画のコメントは、承認されてもメーターはたまらない
    const [first] = await db.query(
      `select 1 from kansha_views where user_id = $1 and video_id = $2 and date = $3 and is_first_of_day`,
      [u.id, videoId, day],
    );
    // 10章：AIに送るのはコメントの本文と年齢区分だけ（ニックネームは送らない）
    const j = await judgeComment({ age: u.age_group, text, video });
    const status = j.verdict === 'ok' ? 'ok' : j.verdict === 'ng' ? 'ng' : 'pending';
    const before = await meterOf(db, u.id);
    await db.query(
      `insert into kansha_comments (user_id, video_id, date, text, verdict, reason, question, status, counts_for_meter, ai_failed)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [u.id, videoId, day, text, j.verdict, j.reason, j.question, status, !!first, j.aiFailed],
    );
    const meter = await meterOf(db, u.id);
    const out: CommentResult = {
      verdict: j.verdict,
      question: j.verdict === 'ng' ? j.question : null, // 迷う（gray）は「受け取ったよ」だけ表示する
      meter,
      meterUp: meter > before,
    };
    res.json(out);
  });

  // 4.6 みんなのコメント：承認済みのものだけ。件数・名前は出さない
  r.get('/videos/:id/comments', async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const rows = await db.query<{ text: string }>(
      `select text from kansha_comments where video_id = $1 and status in ('ok', 'approved') order by random() limit 12`,
      [req.params.id],
    );
    res.json({ comments: rows.map((c) => c.text) });
  });

  r.get('/history', async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const views = await db.query<{ video_id: string; title: string; day: string; watched_at: string; label: string | null }>(
      `select w.video_id, v.title, w.date as day, w.watched_at,
              (select s.label from kansha_selections s where s.user_id = w.user_id and s.video_id = w.video_id
               order by s.date desc limit 1) as label
       from kansha_views w join kansha_videos v on v.id = w.video_id
       where w.user_id = $1
       order by w.watched_at desc, w.id desc`,
      [u.id],
    );
    const comments = await db.query<{ video_id: string; text: string; status: any; question: string | null; created_at: string }>(
      `select video_id, text, status, question, created_at from kansha_comments where user_id = $1 order by created_at`,
      [u.id],
    );
    const items: HistoryItem[] = [];
    const seenVideo = new Set<string>();
    for (const v of views) {
      // 同じ動画を別の日にもう一度見たときは、いちばん新しい1件にまとめる
      if (seenVideo.has(v.video_id)) continue;
      seenVideo.add(v.video_id);
      items.push({
        ...v,
        comments: comments
          .filter((c) => c.video_id === v.video_id)
          .map(({ text, status, question, created_at }) => ({ text, status, question: status === 'ng' || status === 'rejected' ? question : null, created_at })),
      });
    }
    res.json({ items });
  });

  r.post('/notices/seen', async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: unknown) => typeof x === 'string') : [];
    if (ids.length) {
      await db.query(`update kansha_comments set notified_at = now() where user_id = $1 and id = any($2::uuid[])`, [u.id, ids]);
    }
    res.json({ ok: true });
  });

  return r;
}
