// API を通しで確かめる（埋め込み Postgres を使い、AI と YouTube への問い合わせは差し替える）
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.ANTHROPIC_API_KEY ??= 'test';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.SESSION_SECRET = 'test-session-secret';

// AI①：テストごとに返す内容を切り替える。AI②：コメントの先頭で判定を決める
const ai = vi.hoisted(() => ({ selectMode: 'fail' as 'fail' | 'echo' }));
vi.mock('../src/server/ai/claude', () => ({
  AiError: class extends Error {},
  askJson: async ({ user }: { user: string }) => {
    if (user.includes('# 候補の動画')) {
      if (ai.selectMode === 'fail') throw new Error('test: AI failure');
      // 候補の先頭から10本をそのまま返す（ラベルは仮）
      const ids = [...user.matchAll(/^- ([\w-]{11}) \|/gm)].map((m) => m[1]).slice(0, 10);
      return { items: ids.map((id) => ({ video_id: id, label: 'くらしをささえる仕事', path: ['くらし', `video:${id}`], kind: 'general' })) };
    }
    const text = /<comment>(.*)<\/comment>/s.exec(user)?.[1] ?? '';
    const verdict = text.startsWith('OK') ? 'ok' : text.startsWith('NG') ? 'ng' : 'gray';
    return { verdict, reason: 'テスト', question: verdict === 'ok' ? '' : 'どんなところに「ありがとう」と思った？' };
  },
}));

const { openDb, ensureSchema, seedVideos } = await import('../src/server/db');
const { createApp } = await import('../src/server/app');

let server: Server;
let base = '';
const db = await openDb('', undefined); // メモリ上の PGlite

beforeAll(async () => {
  await ensureSchema(db);
  await seedVideos(db);
  const app = createApp(db, { sessionSecret: process.env.SESSION_SECRET!, csp: false });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server?.close();
  await db.close();
  vi.useRealTimers();
});

function agent() {
  let cookie = '';
  return async <T = any>(method: string, path: string, body?: unknown): Promise<T & { _status: number }> => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie();
    if (set.length) {
      const jar = new Map(cookie.split('; ').filter(Boolean).map((c) => c.split('=') as [string, string]));
      for (const s of set) {
        const [kv] = s.split(';');
        const i = kv.indexOf('=');
        jar.set(kv.slice(0, i), kv.slice(i + 1));
      }
      cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    return { ...(await res.json()), _status: res.status };
  };
}

const admin = agent();
const setDay = (iso: string) => vi.setSystemTime(new Date(iso));

async function newChild(age = 'elementary') {
  const { created } = await admin('POST', '/api/admin/invites', { count: 1 });
  const c = agent();
  const r = await c('POST', '/api/register', { code: created[0].toLowerCase(), nickname: 'テスト', age_group: age, consent: true });
  expect(r.ok).toBe(true);
  return { c, code: created[0] };
}

const ANSWERS = {
  parents: { mood: 'ふつう', wake: '6〜7時', breakfast: 'パン', place: '学校', talk: '友達', evening: '勉強した', dinner: 'ごはんとおかず' },
  kids: { bread_drink: ['牛乳'], transport: ['電車'], dinner_side: ['魚'] },
};

describe('通しの確認（15章）', () => {
  it('管理画面はパスワードがないと使えない', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setDay('2026-10-03T12:00:00Z'); // 日本時間 21:00
    expect((await admin('GET', '/api/admin/pending'))._status).toBe(401);
    expect((await admin('POST', '/api/admin/login', { password: 'wrong' }))._status).toBe(401);
    expect((await admin('POST', '/api/admin/login', { password: 'test-admin-password' })).ok).toBe(true);
    expect((await admin('GET', '/api/admin/pending'))._status).toBe(200);
  });

  it('1. 招待コードで登録でき、ニックネーム・年齢区分・同意が保存される（コードは1人1回）', async () => {
    const { code } = await newChild('junior_high');
    const [u] = await db.query(`select u.nickname, u.age_group, u.consent_at, u.consent_by, i.used_at from kansha_users u join kansha_invites i on i.used_by = u.id where i.code = $1`, [code.replace('-', '')]);
    expect(u.nickname).toBe('テスト');
    expect(u.age_group).toBe('junior_high');
    expect(u.consent_at).toBeTruthy();
    expect(u.consent_by).toBe('guardian');
    expect(u.used_at).toBeTruthy();
    const again = await agent()('POST', '/api/register', { code, nickname: 'もう一人', age_group: 'high', consent: true });
    expect(again._status).toBe(400);
    const noConsent = await agent()('POST', '/api/register', { code: 'XXXX-XXXX', nickname: 'a', age_group: 'high', consent: false });
    expect(noConsent._status).toBe(400);
  });

  it('3・4. 10本の一覧。インフラ2〜3本、ラベルと path が保存され、AIが失敗しても代替で選ぶ', async () => {
    ai.selectMode = 'fail';
    const { c } = await newChild();
    await c('PUT', '/api/today/answers', { answers: ANSWERS });
    const { selection } = await c('POST', '/api/today/select', {});
    expect(selection).toHaveLength(10);
    const infra = selection.filter((s: any) => s.kind === 'infra');
    expect(infra.length).toBeGreaterThanOrEqual(2);
    expect(infra.length).toBeLessThanOrEqual(3);
    for (const s of selection) {
      if (s.kind === 'related') expect(s.label).toMatch(/^.+（.+）から$/);
      else expect(s.label).toBe('くらしをささえる仕事');
    }
    const rows = await db.query(`select path, is_fallback, kind from kansha_selections s join kansha_users u on u.id = s.user_id order by s.id desc limit 10`);
    expect(rows.every((r: any) => Array.isArray(r.path) && r.path.at(-1).startsWith('video:'))).toBe(true);
    expect(rows.every((r: any) => r.is_fallback)).toBe(true); // 記録に「代替」と残す
    // 同じ日にもう一度押しても選び直さない
    const again = await c('POST', '/api/today/select', {});
    expect(again.selection.map((s: any) => s.video_id)).toEqual(selection.map((s: any) => s.video_id));
  });

  it('3. 見た動画は次の日の一覧に出ない', async () => {
    ai.selectMode = 'echo';
    const { c } = await newChild();
    const day1 = (await c('POST', '/api/today/select', { answers: ANSWERS })).selection;
    for (const v of day1.slice(0, 3)) await c('POST', '/api/views', { video_id: v.video_id });
    setDay('2026-10-04T12:00:00Z');
    const day2 = (await c('POST', '/api/today/select', { answers: ANSWERS })).selection;
    const seen = new Set(day1.slice(0, 3).map((v: any) => v.video_id));
    expect(day2.some((v: any) => seen.has(v.video_id))).toBe(false);
    expect(day2.filter((s: any) => s.kind === 'infra').length).toBeGreaterThanOrEqual(2);
    setDay('2026-10-03T12:00:00Z');
  });

  it('朝4時までは前の日の続きとして扱う', async () => {
    const { dayKey } = await import('../src/shared/day');
    expect(dayKey(new Date('2026-10-03T18:30:00Z'))).toBe('2026-10-03'); // 日本時間 10/4 3:30
    expect(dayKey(new Date('2026-10-03T19:30:00Z'))).toBe('2026-10-04'); // 日本時間 10/4 4:30
  });

  it('5〜8. 1本目の判定・問いかけ・承認でメーターが増え、2本目以降は増えない。みんなのコメントは本文だけ', async () => {
    ai.selectMode = 'echo';
    const { c } = await newChild();
    const sel = (await c('POST', '/api/today/select', { answers: ANSWERS })).selection;
    const [v1, v2] = sel;

    // 見る前は書けない
    expect((await c('POST', '/api/comments', { video_id: v1.video_id, text: 'OK' }))._status).toBe(400);
    expect((await c('POST', '/api/views', { video_id: v1.video_id })).is_first_of_day).toBe(true);

    const ng = await c('POST', '/api/comments', { video_id: v1.video_id, text: 'NG ありがとう' });
    expect(ng.verdict).toBe('ng');
    expect(ng.question).toBeTruthy(); // ×は問いかけを返す
    expect(ng.meter).toBe(0);

    const gray = await c('POST', '/api/comments', { video_id: v1.video_id, text: 'GRAY ねむそう' });
    expect(gray.verdict).toBe('gray');
    expect(gray.question).toBeNull(); // 迷うは「受け取ったよ」だけ
    expect(gray.meter).toBe(0);

    // 管理者が承認すると、あとから1増える
    const pending = (await admin('GET', '/api/admin/pending')).pending.find((p: any) => p.text === 'GRAY ねむそう');
    expect(pending.age).toBe('小学生');
    expect(pending.rule).toContain('ゆるめ');
    expect((await admin('POST', `/api/admin/comments/${pending.id}/decide`, { approve: true })).ok).toBe(true);
    expect((await admin('POST', `/api/admin/comments/${pending.id}/decide`, { approve: true }))._status).toBe(409);
    const me = await c('GET', '/api/me');
    expect(me.meter).toBe(1);
    expect(me.notices[0]).toMatchObject({ status: 'approved', meter_counted: true });

    // 同じ1本目に ○ をもう一度もらっても、その日の分は1つだけ
    const ok = await c('POST', '/api/comments', { video_id: v1.video_id, text: 'OK 夜中から作っていた' });
    expect(ok).toMatchObject({ verdict: 'ok', meter: 1, meterUp: false });

    // 2本目：承認されてもメーターはたまらない
    expect((await c('POST', '/api/views', { video_id: v2.video_id })).is_first_of_day).toBe(false);
    await c('POST', '/api/comments', { video_id: v2.video_id, text: 'GRAY 2本目' });
    const p2 = (await admin('GET', '/api/admin/pending')).pending.find((p: any) => p.text === 'GRAY 2本目');
    await admin('POST', `/api/admin/comments/${p2.id}/decide`, { approve: true });
    expect((await c('GET', '/api/me')).meter).toBe(1);
    const ok2 = await c('POST', '/api/comments', { video_id: v2.video_id, text: 'OK 2本目もありがとう' });
    expect(ok2).toMatchObject({ verdict: 'ok', meter: 1, meterUp: false });

    // 承認しない → 次に開いたとき問いかけを表示
    await c('POST', '/api/comments', { video_id: v2.video_id, text: 'GRAY 却下される' });
    const p3 = (await admin('GET', '/api/admin/pending')).pending.find((p: any) => p.text === 'GRAY 却下される');
    await admin('POST', `/api/admin/comments/${p3.id}/decide`, { approve: false, question: 'どんな仕事だった？' });
    const notices = (await c('GET', '/api/me')).notices;
    expect(notices.find((n: any) => n.status === 'rejected').question).toBe('どんな仕事だった？');
    await c('POST', '/api/notices/seen', { ids: notices.map((n: any) => n.id) });
    expect((await c('GET', '/api/me')).notices).toHaveLength(0);

    // みんなのコメント：承認済みの本文だけ（件数・名前は返さない）
    const others = await c('GET', `/api/videos/${v1.video_id}/comments`);
    expect(Object.keys(others).filter((k) => k !== '_status')).toEqual(['comments']);
    expect(others.comments.every((t: unknown) => typeof t === 'string')).toBe(true);
    expect(others.comments).toContain('OK 夜中から作っていた');
    expect(others.comments).not.toContain('NG ありがとう');
    expect(others.comments).not.toContain('GRAY 却下される');

    // 履歴：見た動画と自分のコメント
    const hist = await c('GET', '/api/history');
    expect(hist.items.map((i: any) => i.video_id)).toEqual([v2.video_id, v1.video_id]);
    expect(hist.items[1].comments).toHaveLength(3);
  });

  it('電話番号やメールアドレスは AI に頼らず×にする', async () => {
    ai.selectMode = 'echo';
    const { c } = await newChild();
    const [v] = (await c('POST', '/api/today/select', { answers: ANSWERS })).selection;
    await c('POST', '/api/views', { video_id: v.video_id });
    const r = await c('POST', '/api/comments', { video_id: v.video_id, text: 'OK 090-1234-5678 に電話して' });
    expect(r.verdict).toBe('ng');
  });

  it('9. 惑星マップに選定の記録が反映される', async () => {
    const map = await admin('GET', '/api/admin/map');
    const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from kansha_selections`);
    expect(map.totalSelections).toBe(n);
    expect(map.nodes.some((x: any) => x.type === 'answer')).toBe(true);
    expect(map.links.length).toBeGreaterThan(0);
  });

  it('10. 動画審査で承認・拒否・戻すができ、確認ボタンで見られない動画が除外される', async () => {
    const [v] = await db.query<{ id: string }>(`select id from kansha_videos where review_status = 'rejected' limit 1`);
    for (const st of ['pending', 'approved', 'rejected']) {
      expect((await admin('POST', `/api/admin/videos/${v.id}/status`, { status: st })).ok).toBe(true);
      const [row] = await db.query(`select review_status from kansha_videos where id = $1`, [v.id]);
      expect(row.review_status).toBe(st);
    }

    // oEmbed への問い合わせを差し替え：k-wQIiiA2iY だけ見られない
    const realFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/oembed')) {
        return url.includes('k-wQIiiA2iY') ? new Response('Not Found', { status: 404 }) : new Response(JSON.stringify({ title: 't' }), { status: 200 });
      }
      return realFetch(input, init);
    });
    const r = await admin('POST', '/api/admin/videos/check');
    spy.mockRestore();
    expect(r.total).toBe(40);
    expect(r.unavailable.map((u: any) => u.id)).toEqual(['k-wQIiiA2iY']);

    // 動画の追加：URLとジャンルで未審査に入る（タイトルは oEmbed から）
    const spy2 = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) =>
      String(input).startsWith('https://www.youtube.com/oembed')
        ? new Response(JSON.stringify({ title: '新しい動画', author_name: 'チャンネル' }), { status: 200 })
        : realFetch(input, init),
    );
    const added = await admin('POST', '/api/admin/videos', { url: 'https://youtu.be/abcdefghijk?si=x', cat: 'ガス' });
    expect(added).toMatchObject({ ok: true, id: 'abcdefghijk', title: '新しい動画' });
    expect((await admin('POST', '/api/admin/videos', { url: 'https://www.youtube.com/watch?v=abcdefghijk', cat: 'ガス' }))._status).toBe(409);
    expect((await admin('POST', '/api/admin/videos', { url: 'https://example.com/', cat: 'ガス' }))._status).toBe(400);
    spy2.mockRestore();
    const [nv] = await db.query(`select review_status, is_infra, channel, title from kansha_videos where id = 'abcdefghijk'`);
    expect(nv).toEqual({ review_status: 'pending', is_infra: true, channel: 'チャンネル', title: '新しい動画' });

    ai.selectMode = 'echo';
    setDay('2026-10-05T12:00:00Z');
    const { c } = await newChild();
    const sel = (await c('POST', '/api/today/select', { answers: ANSWERS })).selection;
    expect(sel.some((s: any) => s.video_id === 'k-wQIiiA2iY')).toBe(false);
  });
});
