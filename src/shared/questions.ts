// 6章「質問と選択肢」の定義。画面・サーバー・AIへの入力のすべてがここを参照する。

export type ParentId = 'mood' | 'wake' | 'breakfast' | 'place' | 'talk' | 'evening' | 'dinner';

export interface ParentQuestion {
  id: ParentId;
  short: string; // シャボン玉に表示する名前
  q: string;
  opts: string[];
  // 画面見本（390×844）上の位置と大きさ
  x: number;
  y: number;
  size: number;
  delay: number;
  dur: number;
}

export interface KidQuestion {
  id: string;
  parent: ParentId;
  when: string[]; // この親の答えのときに出る
  short: string;
  q: string;
  opts: string[];
  labelPrefix: string; // ラベル「朝ごはん（牛乳）から」の「朝ごはん」部分
}

export const PARENTS: ParentQuestion[] = [
  { id: 'mood', short: 'きぶん', q: '今日の気分はどんな感じ？', opts: ['いい感じ', 'ふつう', 'ちょっとつかれた', 'しんどい'], x: 40, y: 180, size: 118, delay: 0, dur: 6.2 },
  { id: 'wake', short: '起きた時間', q: '朝は何時ごろ起きた？', opts: ['6時より前', '6〜7時', '7〜8時', '8時よりあと'], x: 220, y: 172, size: 104, delay: -1.4, dur: 5.6 },
  { id: 'breakfast', short: '朝ごはん', q: '朝ごはんは何を食べた？', opts: ['ごはん', 'パン', 'シリアル・ほか', 'おにぎり（買ってきた）', 'くだもの', 'ヨーグルト', '食べてない'], x: 140, y: 302, size: 112, delay: -2.6, dur: 6.8 },
  { id: 'place', short: '過ごした場所', q: '今日はどこで過ごした？', opts: ['家', '学校', 'それ以外'], x: 22, y: 432, size: 110, delay: -0.8, dur: 5.9 },
  { id: 'talk', short: '話した人', q: '今日だれかと話した？', opts: ['家族', '友達', '先生', 'お店の人', '駅員さん・運転手さん', 'お医者さん・看護師さん', 'オンラインで', '話してない'], x: 264, y: 312, size: 104, delay: -3.3, dur: 6.4 },
  { id: 'evening', short: '夕方', q: '夕方は何をした？', opts: ['家でゆっくり', '習いごと・部活', '外で遊んだ', '勉強した', 'ゲーム・動画', '買い物'], x: 232, y: 472, size: 100, delay: -2.0, dur: 5.4 },
  { id: 'dinner', short: '夜ごはん', q: '夜ごはんは何を食べた？', opts: ['ごはんとおかず', 'めん', 'パン', 'お店で食べた', 'お弁当・おそうざい', '出前', 'そのほか'], x: 100, y: 582, size: 112, delay: -4.1, dur: 6.6 },
];

export const KIDS: KidQuestion[] = [
  { id: 'breakfast_side', parent: 'breakfast', when: ['ごはん'], short: 'いっしょに', q: 'いっしょに食べたものは？', opts: ['たまご', 'なっとう', 'みそ汁', 'のり', '魚'], labelPrefix: '朝ごはん' },
  { id: 'bread_topping', parent: 'breakfast', when: ['パン'], short: 'つけたもの', q: '何をつけた？', opts: ['バター', 'ジャム', 'たまご', 'なし'], labelPrefix: '朝ごはん' },
  { id: 'bread_drink', parent: 'breakfast', when: ['パン'], short: '飲みもの', q: 'いっしょに飲んだものは？', opts: ['牛乳', 'お茶', 'ジュース', '水'], labelPrefix: '朝ごはん' },
  { id: 'cereal_topping', parent: 'breakfast', when: ['シリアル・ほか'], short: 'かけたもの', q: '何をかけた？', opts: ['牛乳', 'ヨーグルト', 'なし'], labelPrefix: '朝ごはん' },
  { id: 'dinner_side', parent: 'dinner', when: ['ごはんとおかず'], short: 'おかず', q: 'おかずは？', opts: ['肉', '魚', 'たまご', '野菜', 'とうふ'], labelPrefix: '夜ごはん' },
  { id: 'noodle_type', parent: 'dinner', when: ['めん'], short: 'めん', q: 'どんなめん？', opts: ['うどん', 'そば', 'ラーメン', 'パスタ'], labelPrefix: '夜ごはん' },
  { id: 'transport', parent: 'place', when: ['学校', 'それ以外'], short: '行き方', q: 'どうやって行った？', opts: ['歩き', '自転車', 'バス', '電車', '車'], labelPrefix: '移動' },
  { id: 'place_where', parent: 'place', when: ['それ以外'], short: 'どこで', q: 'どこで？', opts: ['図書館', '公園', 'お店', '病院', '習いごと', 'フリースクール'], labelPrefix: '過ごした場所' },
];

// 小さな泡の位置（画面見本の座標系）。親の泡が弾けたあとの場所に出す。
export const KID_POS: Record<string, { x: number; y: number }> = {
  breakfast_side: { x: 120, y: 318 },
  bread_topping: { x: 120, y: 318 },
  bread_drink: { x: 200, y: 372 },
  cereal_topping: { x: 120, y: 318 },
  dinner_side: { x: 172, y: 650 },
  noodle_type: { x: 172, y: 650 },
  transport: { x: 90, y: 500 },
  place_where: { x: 12, y: 566 },
};

// 答えなかった親の質問は null、小さな泡は選んだもの（飛ばしたら空配列）
export interface Answers {
  parents: Partial<Record<ParentId, string | null>>;
  kids: Record<string, string[]>;
}

export const emptyAnswers = (): Answers => ({ parents: {}, kids: {} });

export function kidsFor(parent: ParentId, answer: string | null | undefined): KidQuestion[] {
  if (!answer) return [];
  return KIDS.filter((k) => k.parent === parent && k.when.includes(answer));
}

export const parentById = (id: string) => PARENTS.find((p) => p.id === id);
export const kidById = (id: string) => KIDS.find((k) => k.id === id);

// 回答を「つながりの起点」として表す。path の先頭、ラベル、惑星マップの恒星に使う。
export interface AnswerRoot {
  root: string; // 例：「朝ごはん:パン」
  label: string; // 例：「朝ごはん（パン）から」
  answer: string; // 例：「パン」
  question: string; // 例：「朝ごはん」
}

const NO_ROOT = new Set(['食べてない', '話してない', 'なし']);

export function answerRoots(a: Answers): AnswerRoot[] {
  const out: AnswerRoot[] = [];
  const seen = new Set<string>();
  const push = (question: string, answer: string) => {
    if (NO_ROOT.has(answer)) return;
    const root = `${question}:${answer}`;
    if (seen.has(root)) return;
    seen.add(root);
    out.push({ root, label: `${question}（${answer}）から`, answer, question });
  };
  for (const p of PARENTS) {
    const v = a.parents[p.id];
    if (!v) continue;
    // 気分は動画の選定には使わない（つながりの起点にしない）
    if (p.id !== 'mood') push(p.short, v);
    for (const k of kidsFor(p.id, v)) {
      for (const pick of a.kids[k.id] ?? []) push(k.labelPrefix, pick);
    }
  }
  return out;
}

// 回答を人が読める行にする（AIへの入力用。ニックネームなど個人の情報は含めない）
export function describeAnswers(a: Answers): string[] {
  const lines: string[] = [];
  for (const p of PARENTS) {
    if (!(p.id in a.parents)) continue;
    const v = a.parents[p.id];
    lines.push(`${p.short}（${p.q}）：${v ?? '（答えなかった）'}`);
    for (const k of kidsFor(p.id, v)) {
      const picks = a.kids[k.id];
      if (picks && picks.length) lines.push(`  └ ${k.q}：${picks.join('、')}`);
    }
  }
  return lines;
}

// 送られてきた回答を、定義にある値だけに絞る
export function sanitizeAnswers(input: unknown): Answers {
  const out = emptyAnswers();
  if (!input || typeof input !== 'object') return out;
  const src = input as { parents?: Record<string, unknown>; kids?: Record<string, unknown> };
  for (const p of PARENTS) {
    if (!src.parents || !(p.id in src.parents)) continue;
    const v = src.parents[p.id];
    if (v === null) out.parents[p.id] = null;
    else if (typeof v === 'string' && p.opts.includes(v)) out.parents[p.id] = v;
  }
  for (const k of KIDS) {
    const v = src.kids?.[k.id];
    if (!Array.isArray(v)) continue;
    if (!kidsFor(k.parent, out.parents[k.parent]).includes(k)) continue;
    out.kids[k.id] = [...new Set(v.filter((x): x is string => typeof x === 'string' && k.opts.includes(x)))];
  }
  return out;
}
