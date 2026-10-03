import type { Answers } from '../../shared/questions';
import { answerRoots, type AnswerRoot } from '../../shared/questions';
import { LABEL_GENERAL, ROOT_GENERAL, ROOT_INFRA } from '../../shared/genres';
import type { SelectionKind } from '../../shared/types';

export interface Candidate {
  id: string;
  cat: string;
  title: string;
  summary: string;
  job: string;
  is_infra: boolean;
}

export interface Pick {
  video_id: string;
  label: string;
  path: string[];
  kind: SelectionKind;
  is_fallback: boolean;
}

// 7章【提案】AIが失敗したときに使う「ジャンルの対応表」
// 回答 → 直接つながるジャンル
export const DIRECT: Record<string, string[]> = {
  ごはん: ['お米'],
  パン: ['パン'],
  'シリアル・ほか': ['酪農'],
  'おにぎり（買ってきた）': ['お米', 'お弁当'],
  くだもの: ['市場'],
  ヨーグルト: ['酪農'],
  たまご: ['卵'],
  なっとう: ['豆腐'],
  みそ汁: ['豆腐'],
  のり: ['漁業'],
  魚: ['漁業', '市場'],
  バター: ['酪農'],
  牛乳: ['酪農'],
  ごはんとおかず: ['お米'],
  お店で食べた: ['外食'],
  'お弁当・おそうざい': ['お弁当'],
  出前: ['外食', '運送'],
  野菜: ['市場'],
  とうふ: ['豆腐'],
  肉: ['市場'],
  学校: ['給食'],
  家: ['住まい'],
  電車: ['鉄道'],
  バス: ['道路', '運送'],
  車: ['道路', '運送'],
  自転車: ['道路'],
  歩き: ['道路'],
  '駅員さん・運転手さん': ['鉄道', '運送'],
  お店の人: ['市場', '運送'],
  先生: ['給食'],
  買い物: ['市場', '運送'],
  'ゲーム・動画': ['電気'],
  家でゆっくり: ['住まい'],
  お店: ['市場', '運送'],
  '6時より前': ['パン', '運送'],
};

// ジャンル → つながりをたどった先（例：パン→小麦→農家、パン→工場→電気）
export const EXPAND: Record<string, { via: string; to: string }[]> = {
  パン: [{ via: '小麦', to: 'お米' }, { via: '配送', to: '運送' }, { via: '工場', to: '電気' }, { via: 'たまご', to: '卵' }],
  お米: [{ via: '田んぼの水', to: '水道' }, { via: '運ぶ', to: '運送' }, { via: 'おにぎり', to: 'お弁当' }],
  酪農: [{ via: '運ぶ', to: '運送' }, { via: '牧場の水', to: '水道' }],
  漁業: [{ via: '競り', to: '市場' }, { via: '運ぶ', to: '運送' }],
  市場: [{ via: '仕入れ', to: '漁業' }, { via: '運ぶ', to: '運送' }],
  給食: [{ via: '食材', to: 'お米' }, { via: '運ぶ', to: '運送' }, { via: '調理', to: 'ガス' }],
  鉄道: [{ via: '電気', to: '電気' }, { via: '線路', to: '道路' }],
  豆腐: [{ via: '大豆と水', to: '水道' }, { via: '運ぶ', to: '運送' }],
  外食: [{ via: '仕入れ', to: '市場' }, { via: 'ごはん', to: 'お米' }],
  お弁当: [{ via: 'ごはん', to: 'お米' }, { via: '運ぶ', to: '運送' }],
  運送: [{ via: '道', to: '道路' }],
  住まい: [{ via: 'あかり', to: '電気' }, { via: '水', to: '水道' }, { via: 'ごみ', to: 'ごみ' }],
  卵: [{ via: '運ぶ', to: '運送' }],
  道路: [{ via: '運ぶ', to: '運送' }],
  電気: [{ via: '電車', to: '鉄道' }],
};

const directCats = (r: AnswerRoot) => DIRECT[r.answer] ?? [];

// 同じ日に同じ子が開いたら同じ並びになるよう、種のある乱数を使う
export function seededRandom(seedText: string) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], rnd: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const TARGET = 10;
export const INFRA_POSITIONS = [2, 5, 8]; // 3番目・6番目・9番目に散らす（画面見本と同じ）

export function infraRange(cands: Candidate[]) {
  const avail = cands.filter((c) => c.is_infra).length;
  return { min: Math.min(2, avail), max: Math.min(3, avail) };
}

// 選べる本数（候補が少ないときは10本より少なくなる）
export function targetCount(cands: Candidate[]) {
  return Math.min(TARGET, cands.filter((c) => !c.is_infra).length + infraRange(cands).max);
}

// インフラを決まった位置に差し込み、それ以外は順番を保つ
export function arrange(nonInfra: Pick[], infra: Pick[]): Pick[] {
  const out = nonInfra.slice();
  infra.forEach((p, j) => out.splice(Math.min(INFRA_POSITIONS[j] ?? out.length, out.length), 0, p));
  return out;
}

export function fallbackSelect(answers: Answers, cands: Candidate[], seed: string): Pick[] {
  const rnd = seededRandom(seed);
  const roots = answerRoots(answers);
  const pool = shuffle(cands, rnd);
  const used = new Set<string>();
  const nonInfraPool = pool.filter((c) => !c.is_infra);
  const infraPool = pool.filter((c) => c.is_infra);
  const { min: infraMin, max: infraMax } = infraRange(cands);

  const perCat = new Map<string, number>();
  const take = (cat: string, list: Candidate[], cap = Infinity) => {
    if ((perCat.get(cat) ?? 0) >= cap) return undefined;
    const c = list.find((x) => x.cat === cat && !used.has(x.id));
    if (c) {
      used.add(c.id);
      perCat.set(cat, (perCat.get(cat) ?? 0) + 1);
    }
    return c;
  };

  const related: Pick[] = [];
  const nonInfraNeed = () => TARGET - infraMax - related.length;

  // 1) 回答に直接つながる動画。起点ごとに順番に1本ずつ（同じジャンルは2本まで）
  const directPass = (cap: number) => {
    const queues = roots.map((r) => ({ r, cats: directCats(r).slice() }));
    let progress = true;
    while (progress && nonInfraNeed() > 0) {
      progress = false;
      for (const q of queues) {
        if (nonInfraNeed() <= 0) break;
        while (q.cats.length) {
          const cat = q.cats.shift()!;
          const c = take(cat, nonInfraPool, cap);
          if (c) {
            related.push({ video_id: c.id, label: q.r.label, path: [q.r.root, `テーマ:${cat}`, `video:${c.id}`], kind: 'related', is_fallback: true });
            q.cats.unshift(cat); // 同じジャンルにまだ動画があれば、次の周でもう1本
            progress = true;
            break;
          }
        }
      }
    }
  };
  directPass(2);

  // 2) 足りなければ、つながりをたどって広げる
  outer: for (const r of roots) {
    for (const cat of directCats(r)) {
      for (const e of EXPAND[cat] ?? []) {
        if (nonInfraNeed() <= 0) break outer;
        const c = take(e.to, nonInfraPool, 2);
        if (c) related.push({ video_id: c.id, label: r.label, path: [r.root, `テーマ:${e.via}`, `テーマ:${e.to}`, `video:${c.id}`], kind: 'related', is_fallback: true });
      }
    }
  }

  // 3) まだ足りなければ、直接つながるジャンルの残りも使う
  directPass(Infinity);

  // 3) インフラ（2〜3本）。回答からつながるものがあれば道筋を残す（ラベルは「くらしをささえる仕事」）
  const infraCount = related.length >= TARGET - infraMin ? infraMin : infraMax;
  const infra: Pick[] = [];
  const infraCats = new Set<string>();
  for (const r of roots) {
    const routes = directCats(r).flatMap((cat) => [
      { cat, path: [r.root, `テーマ:${cat}`] },
      ...(EXPAND[cat] ?? []).map((e) => ({ cat: e.to, path: [r.root, `テーマ:${e.via}`, `テーマ:${e.to}`] })),
    ]);
    for (const route of routes) {
      if (infra.length >= infraCount) break;
      const c = infraPool.find((x) => x.cat === route.cat && !used.has(x.id));
      if (c && !infraCats.has(c.cat)) {
        used.add(c.id);
        infraCats.add(c.cat);
        infra.push({ video_id: c.id, label: LABEL_GENERAL, path: [...route.path, `video:${c.id}`], kind: 'infra', is_fallback: true });
      }
    }
  }
  // ジャンルが重ならないように選び、それでも足りなければ同じジャンルから
  for (const pass of [true, false]) {
    for (const c of infraPool) {
      if (infra.length >= infraCount) break;
      if (used.has(c.id) || (pass && infraCats.has(c.cat))) continue;
      used.add(c.id);
      infraCats.add(c.cat);
      infra.push({ video_id: c.id, label: LABEL_GENERAL, path: [ROOT_INFRA, `テーマ:${c.cat}`, `video:${c.id}`], kind: 'infra', is_fallback: true });
    }
  }

  // 4) それでも足りないときだけ、回答と関係のない仕事
  const general: Pick[] = [];
  for (const c of nonInfraPool) {
    if (related.length + general.length + infra.length >= TARGET) break;
    if (used.has(c.id)) continue;
    used.add(c.id);
    general.push({ video_id: c.id, label: LABEL_GENERAL, path: [ROOT_GENERAL, `テーマ:${c.cat}`, `video:${c.id}`], kind: 'general', is_fallback: true });
  }

  const nonInfra = related.concat(general).slice(0, TARGET - infra.length);
  return arrange(nonInfra, infra);
}
