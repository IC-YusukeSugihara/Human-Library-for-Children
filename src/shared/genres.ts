// ジャンル（動画の cat）と、惑星マップの色分け（分野）の対応

export type Field = 'food' | 'move' | 'learn' | 'home' | 'infra' | 'other' | 'link' | 'answer';

export const FIELDS: Record<Field, { name: string; c: string; dark: string }> = {
  food: { name: '食', c: '#F6D38A', dark: '#7E5F22' },
  move: { name: '移動', c: '#8FE9F5', dark: '#22626C' },
  learn: { name: '学び', c: '#A8E6A1', dark: '#356B30' },
  home: { name: '住まい', c: '#F2A7A0', dark: '#7E413B' },
  infra: { name: 'インフラ', c: '#B9A8FF', dark: '#433486' },
  other: { name: 'その他', c: '#C9D1EC', dark: '#4A5275' },
  link: { name: 'つながり', c: '#7F8AB0', dark: '#2E3557' },
  answer: { name: '回答', c: '#FFF6D6', dark: '#C9A55A' },
};

const CAT_FIELD: Record<string, Field> = {
  お米: 'food', パン: 'food', 漁業: 'food', 酪農: 'food', 豆腐: 'food', 市場: 'food',
  外食: 'food', お弁当: 'food', 卵: 'food',
  給食: 'learn',
  運送: 'move', 鉄道: 'move',
  住まい: 'home',
  電気: 'infra', 水道: 'infra', ごみ: 'infra', ガス: 'infra', 道路: 'infra',
};

export const fieldOfCat = (cat: string): Field => CAT_FIELD[cat] ?? 'other';

// 7章：インフラ（電気・水道・ごみ・ガス・道路）
export const INFRA_CATS = ['電気', '水道', 'ごみ', 'ガス', '道路'];

export const LABEL_GENERAL = 'くらしをささえる仕事';
export const ROOT_INFRA = 'インフラ';
export const ROOT_GENERAL = 'くらし';
