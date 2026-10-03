import type { Answers } from './questions';

export type AgeGroup = 'elementary' | 'junior_high' | 'high' | 'university';

export const AGE_LABEL: Record<AgeGroup, string> = {
  elementary: '小学生',
  junior_high: '中学生',
  high: '高校生',
  university: '大学生',
};

export const AGE_GROUPS = Object.keys(AGE_LABEL) as AgeGroup[];

export type SelectionKind = 'related' | 'infra' | 'general';

export interface VideoCard {
  video_id: string;
  rank: number;
  label: string;
  kind: SelectionKind;
  title: string;
  summary: string;
  job: string;
  cat: string;
  watched: boolean;
}

export type Verdict = 'ok' | 'ng' | 'gray';
export type CommentStatus = 'ok' | 'ng' | 'pending' | 'approved' | 'rejected';

export interface Notice {
  id: string;
  status: 'approved' | 'rejected';
  video_title: string;
  text: string;
  question: string | null;
  meter_counted: boolean;
}

export interface MeState {
  user: { nickname: string; age_group: AgeGroup } | null;
  day: string;
  meter: number;
  answers: Answers | null;
  selection: VideoCard[] | null;
  watchedToday: string[];
  notices: Notice[];
}

export interface CommentResult {
  verdict: Verdict;
  question: string | null;
  meter: number;
  meterUp: boolean;
}

export interface HistoryItem {
  video_id: string;
  title: string;
  label: string | null;
  day: string;
  watched_at: string;
  comments: { text: string; status: CommentStatus; question: string | null; created_at: string }[];
}

// 9章：メーターの解放（試作では 5・10・20）
export const UNLOCKS = [
  { at: 5, key: 'colors', name: 'シャボン玉の色がふえる' },
  { at: 10, key: 'bright', name: '空がすこし明るくなる' },
  { at: 20, key: 'meteor', name: '流れ星が見える' },
] as const;

export type UnlockKey = (typeof UNLOCKS)[number]['key'];

export const unlockedKeys = (meter: number): UnlockKey[] =>
  UNLOCKS.filter((u) => meter >= u.at).map((u) => u.key);
