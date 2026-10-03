import type { Db, Queryable } from './db';
import type { Candidate } from './selection/fallback';
import type { Notice, VideoCard } from '../shared/types';

// 画面とAIの両方から使う、よく使う問い合わせ

// 11章【提案】メーターの値は kansha_comments から計算する（二重加算を防ぐため）。
// その日の1本目の動画へのコメントが ○（AIの ok か管理者の承認）になった日を1つと数える。
export async function meterOf(q: Queryable, userId: string): Promise<number> {
  const [r] = await q.query<{ n: number }>(
    `select count(distinct date)::int as n from kansha_comments
     where user_id = $1 and counts_for_meter and status in ('ok', 'approved')`,
    [userId],
  );
  return r?.n ?? 0;
}

// 選ぶ対象：承認済みで、動画の確認で「見られない」になっていない、その子がまだ見ていない動画
export async function candidatesFor(db: Db, userId: string): Promise<{ cands: Candidate[]; seen: string[] }> {
  const seen = (await db.query<{ video_id: string }>(`select distinct video_id from kansha_views where user_id = $1`, [userId])).map(
    (r) => r.video_id,
  );
  const cands = await db.query<Candidate>(
    `select id, cat, title, summary, job, is_infra from kansha_videos
     where review_status = 'approved' and available is not false
       and id not in (select video_id from kansha_views where user_id = $1)
     order by sort_order`,
    [userId],
  );
  return { cands, seen };
}

export async function selectionFor(db: Db, userId: string, day: string): Promise<VideoCard[]> {
  return db.query<VideoCard>(
    `select s.video_id, s.rank, s.label, s.kind, v.title, v.summary, v.job, v.cat,
            exists (select 1 from kansha_views w where w.user_id = s.user_id and w.video_id = s.video_id) as watched
     from kansha_selections s join kansha_videos v on v.id = s.video_id
     where s.user_id = $1 and s.date = $2
     order by s.rank`,
    [userId, day],
  );
}

// 承認待ちだったコメントの結果のうち、まだ子どもが見ていないもの
export async function noticesFor(db: Db, userId: string): Promise<Notice[]> {
  return db.query<Notice>(
    `select c.id, c.status, v.title as video_title, c.text, c.question,
            (c.status = 'approved' and c.counts_for_meter and not exists (
               select 1 from kansha_comments o
               where o.user_id = c.user_id and o.date = c.date and o.id <> c.id and o.counts_for_meter
                 and (o.status = 'ok' or (o.status = 'approved' and o.decided_at < c.decided_at))
             )) as meter_counted
     from kansha_comments c join kansha_videos v on v.id = c.video_id
     where c.user_id = $1 and c.status in ('approved', 'rejected') and c.notified_at is null
     order by c.decided_at`,
    [userId],
  );
}
