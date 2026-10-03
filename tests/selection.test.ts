import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIDS, PARENTS, answerRoots, kidsFor, sanitizeAnswers, type Answers } from '../src/shared/questions';
import { fallbackSelect, seededRandom, type Candidate } from '../src/server/selection/fallback';
import { checkRules, finalizePicks } from '../src/server/selection/finalize';
import { LABEL_GENERAL } from '../src/shared/genres';
import { buildPlanetMap } from '../src/server/planetMap';

const seed = JSON.parse(readFileSync('seed_videos.json', 'utf8')) as (Candidate & { review_status: string })[];
const approved: Candidate[] = seed
  .filter((v) => v.review_status === 'approved')
  .map(({ id, cat, title, summary, job, is_infra }) => ({ id, cat, title, summary, job, is_infra }));

function randomAnswers(rnd: () => number): Answers {
  const a: Answers = { parents: {}, kids: {} };
  for (const p of PARENTS) {
    const r = rnd();
    a.parents[p.id] = r < 0.15 ? null : p.opts[Math.floor(rnd() * p.opts.length)];
    for (const k of kidsFor(p.id, a.parents[p.id])) {
      if (rnd() < 0.3) continue; // 小さな泡は答えなくてもよい
      a.kids[k.id] = k.opts.filter(() => rnd() < 0.4);
    }
  }
  return a;
}

describe('6章 質問と小さな泡', () => {
  it('小さな泡は条件どおりに出る', () => {
    expect(kidsFor('breakfast', 'ごはん').map((k) => k.q)).toEqual(['いっしょに食べたものは？']);
    expect(kidsFor('breakfast', 'パン').map((k) => k.q)).toEqual(['何をつけた？', 'いっしょに飲んだものは？']);
    expect(kidsFor('breakfast', 'シリアル・ほか').map((k) => k.q)).toEqual(['何をかけた？']);
    expect(kidsFor('dinner', 'ごはんとおかず').map((k) => k.q)).toEqual(['おかずは？']);
    expect(kidsFor('dinner', 'めん').map((k) => k.q)).toEqual(['どんなめん？']);
    expect(kidsFor('place', '学校').map((k) => k.q)).toEqual(['どうやって行った？']);
    expect(kidsFor('place', 'それ以外').map((k) => k.q)).toEqual(['どうやって行った？', 'どこで？']);
    // 「食べてない」「家」と答えたとき、飛ばしたときは出さない
    expect(kidsFor('breakfast', '食べてない')).toEqual([]);
    expect(kidsFor('place', '家')).toEqual([]);
    expect(kidsFor('breakfast', null)).toEqual([]);
    expect(KIDS).toHaveLength(8);
  });

  it('7つの質問と選択肢が仕様どおり', () => {
    expect(PARENTS.map((p) => p.short)).toEqual(['きぶん', '起きた時間', '朝ごはん', '過ごした場所', '話した人', '夕方', '夜ごはん']);
    expect(PARENTS.find((p) => p.id === 'talk')!.opts).toHaveLength(8);
    expect(PARENTS.find((p) => p.id === 'breakfast')!.opts).toHaveLength(7);
  });

  it('送られてきた回答は定義にある値だけ残す', () => {
    const a = sanitizeAnswers({
      parents: { breakfast: 'パン', place: '家', mood: 'うそ', wake: null },
      kids: { bread_drink: ['牛乳', 'コーラ'], transport: ['電車'] },
    });
    expect(a.parents).toEqual({ breakfast: 'パン', place: '家', wake: null });
    expect(a.kids).toEqual({ bread_drink: ['牛乳'] }); // 「家」のときの行き方は捨てる
  });

  it('ラベルは「朝ごはん（パン）から」の形', () => {
    const roots = answerRoots(sanitizeAnswers({ parents: { breakfast: 'パン', place: '学校' }, kids: { bread_drink: ['牛乳'], transport: ['電車'] } }));
    expect(roots.map((r) => r.label)).toEqual(['朝ごはん（パン）から', '朝ごはん（牛乳）から', '過ごした場所（学校）から', '移動（電車）から']);
    expect(roots[0].root).toBe('朝ごはん:パン');
  });
});

describe('7章 代替の選定（ジャンルの対応表）', () => {
  it('どんな回答でも、10本・インフラ2〜3本・重複なし・ラベルとpathがルールどおり', () => {
    const rnd = seededRandom('test');
    for (let i = 0; i < 300; i++) {
      const a = randomAnswers(rnd);
      const picks = fallbackSelect(a, approved, `seed-${i}`);
      expect(checkRules(picks, approved, new Set())).toEqual([]);
      expect(picks.every((p) => p.is_fallback)).toBe(true);
    }
  });

  it('回答に近いものから並び、インフラは3・6・9番目あたりに入る', () => {
    const a = sanitizeAnswers({ parents: { breakfast: 'パン', dinner: 'ごはんとおかず' }, kids: { dinner_side: ['魚'] } });
    const picks = fallbackSelect(a, approved, 'x');
    expect(picks[0].label).toBe('朝ごはん（パン）から');
    expect(picks[0].path[0]).toBe('朝ごはん:パン');
    expect(picks.filter((p) => p.kind === 'infra').every((p) => p.label === LABEL_GENERAL)).toBe(true);
    expect([2, 5].every((i) => picks[i].kind === 'infra')).toBe(true);
  });

  it('見た動画が多くて候補が少ないときも、ルールを守って出せるだけ出す', () => {
    const few = approved.filter((c) => !c.is_infra).slice(0, 5).concat(approved.filter((c) => c.is_infra).slice(0, 1));
    const picks = fallbackSelect(sanitizeAnswers({ parents: { breakfast: 'パン' } }), few, 's');
    expect(checkRules(picks, few, new Set())).toEqual([]);
    expect(picks).toHaveLength(6);
  });
});

describe('7章 AIの出力をルールに合わせて整える', () => {
  const answers = sanitizeAnswers({ parents: { breakfast: 'パン' }, kids: { bread_drink: ['牛乳'] } });
  const fb = fallbackSelect(answers, approved, 'f');
  const infra = approved.filter((c) => c.is_infra);
  const bread = approved.filter((c) => c.cat === 'パン');

  it('候補にない動画・重複・多すぎるインフラ・本人と言い切るラベルを直す', () => {
    const raw = [
      { video_id: 'zzzzzzzzzzz', label: '朝ごはん（パン）から', path: [], kind: 'related' },
      { video_id: bread[0].id, label: 'あなたのパンを焼いた人', path: ['朝ごはん:パン', 'テーマ:パン工房', `video:${bread[0].id}`], kind: 'related' },
      { video_id: bread[0].id, label: '朝ごはん（パン）から', path: [], kind: 'related' },
      ...infra.slice(0, 5).map((c) => ({ video_id: c.id, label: '朝ごはん（パン）から', path: ['インフラ'], kind: 'related' })),
    ];
    const picks = finalizePicks(raw, answers, approved, fb);
    expect(checkRules(picks, approved, new Set())).toEqual([]);
    const first = picks.find((p) => p.video_id === bread[0].id)!;
    expect(first.label).toBe('朝ごはん（パン）から'); // 起点（path の先頭）からラベルを作り直す
    expect(first.path).toEqual(['朝ごはん:パン', 'テーマ:パン工房', 'テーマ:パン', `video:${bread[0].id}`]);
    expect(first.is_fallback).toBe(false);
    expect(picks.filter((p) => p.kind === 'infra')).toHaveLength(3);
    expect(picks.some((p) => p.is_fallback)).toBe(true); // 足りない分は代替で埋め、印を付ける
  });

  it('AIが空を返したら、すべて代替', () => {
    const picks = finalizePicks([], answers, approved, fb);
    expect(checkRules(picks, approved, new Set())).toEqual([]);
    expect(picks.every((p) => p.is_fallback)).toBe(true);
  });
});

describe('5.2 惑星マップの集計', () => {
  it('path から恒星・惑星・線と回数を作る', () => {
    const map = buildPlanetMap(
      [
        ['朝ごはん:パン', 'テーマ:パン', 'video:a'],
        ['朝ごはん:パン', 'テーマ:小麦', 'テーマ:お米', 'video:b'],
        ['インフラ', 'テーマ:電気', 'video:c'],
        ['朝ごはん:パン', 'テーマ:パン', 'video:d'],
      ],
      [{ parents: { breakfast: 'パン' }, kids: {} }, { parents: { breakfast: 'パン' }, kids: {} }, { parents: { breakfast: 'ごはん' }, kids: {} }],
      new Set(['パン', 'お米', '電気']),
    );
    const node = (id: string) => map.nodes.find((n) => n.id === id)!;
    expect(node('a:朝ごはん:パン').n).toBe(2); // 選ばれた回数
    expect(node('t:パン').n).toBe(2); // 表示回数
    expect(node('t:パン').field).toBe('food');
    expect(node('t:小麦').field).toBe('link');
    expect(node('t:電気').field).toBe('infra');
    expect(map.links.find((l) => l.from === 'a:朝ごはん:パン' && l.to === 't:パン')!.n).toBe(2);
    expect(map.slots['t:電気']).toEqual({ infra: 1, general: 0 });
  });
});
