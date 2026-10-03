import { z } from 'zod';
import { answerRoots, describeAnswers, type Answers } from '../../shared/questions';
import { LABEL_GENERAL, ROOT_GENERAL, ROOT_INFRA } from '../../shared/genres';
import { fallbackSelect, infraRange, targetCount, type Candidate, type Pick } from '../selection/fallback';
import { finalizePicks, type RawPick } from '../selection/finalize';
import { askJson } from './claude';

// 7章：動画の選び方（AI①）

const Output = z.object({
  items: z.array(
    z.object({
      video_id: z.string(),
      label: z.string(),
      path: z.array(z.string()),
      kind: z.enum(['related', 'infra', 'general']),
    }),
  ),
});

function systemPrompt(n: number, infraMin: number, infraMax: number) {
  return `あなたは、子ども向けのアプリで、その日の回答に合わせて「くらしを支える仕事をしている人」のノンフィクション動画を選ぶ係です。

# ルール
- 候補の中から、ちょうど ${n} 本を選ぶ。候補にない動画IDは使わない。同じ動画を2回選ばない。
- 回答に近い順に並べる。
- インフラ（インフラ=はい）の動画を ${infraMin}〜${infraMax} 本入れる。3番目・6番目・9番目あたりに散らして置く。
- 回答に近い動画が足りないときは、つながりをたどって広げる（例：パン→小麦→農家、パン→工場→電気）。それでも足りないときだけ、回答と関係のない仕事を選ぶ。
- 同じジャンルばかりにならないようにする（回答に強く関係するジャンルは2〜3本まで）。

# label（カードに表示する短い言葉）
- 回答に関係する動画：下の「起点」一覧の label をそのまま使う（例：「朝ごはん（パン）から」）。
- インフラの動画と、回答と関係のない動画：「${LABEL_GENERAL}」。
- 動画の人を、その子の今日を支えた本人と言い切る表現（例：「あなたのパンを焼いた人」）は使わない。

# path（選んだ理由の道筋。あとで集計に使う）
- 回答に関係する動画：["<起点の root>", 0〜2個の "テーマ:<つながりの言葉>", "テーマ:<動画のジャンル>", "video:<動画ID>"]
  例：["朝ごはん:パン", "テーマ:パン", "video:abc"]、["朝ごはん:パン", "テーマ:小麦", "テーマ:お米", "video:def"]
- インフラ：回答からつながるなら起点から書く。そうでなければ ["${ROOT_INFRA}", "テーマ:<ジャンル>", "video:<ID>"]
- 回答と関係のない動画：["${ROOT_GENERAL}", "テーマ:<ジャンル>", "video:<ID>"]

# kind
- related：回答に関係する（つながりをたどったものも含む）
- infra：インフラの動画
- general：回答と関係のない仕事`;
}

export async function aiSelect(answers: Answers, cands: Candidate[], seenIds: string[], thinking = true): Promise<RawPick[]> {
  const n = targetCount(cands);
  const { min, max } = infraRange(cands);
  const roots = answerRoots(answers);
  const user = [
    '# 今日の回答',
    ...(describeAnswers(answers).length ? describeAnswers(answers) : ['（回答なし）']),
    '',
    '# 起点（root と label）',
    ...(roots.length ? roots.map((r) => `- root: ${r.root} ／ label: ${r.label}`) : ['（なし：すべて回答と関係のない仕事として選ぶ）']),
    '',
    '# 候補の動画（動画ID | ジャンル | インフラ | 映っている仕事 | タイトル | 概要）',
    ...cands.map((c) => `- ${c.id} | ${c.cat} | ${c.is_infra ? 'はい' : 'いいえ'} | ${c.job} | ${c.title} | ${c.summary}`),
    '',
    '# この子がすでに見た動画ID（選ばない）',
    seenIds.length ? seenIds.join(', ') : '（なし）',
  ].join('\n');

  const out = await askJson({ schema: Output, system: systemPrompt(n, min, max), user, maxTokens: 4000, effort: 'low', thinking });
  return out.items;
}

export interface SelectResult {
  picks: Pick[];
  usedFallback: boolean;
  error?: string;
}

export async function selectVideos(answers: Answers, cands: Candidate[], seenIds: string[], seed: string): Promise<SelectResult> {
  const fb = fallbackSelect(answers, cands, seed);
  if (!cands.length) return { picks: [], usedFallback: false };
  try {
    const raw = await aiSelect(answers, cands, seenIds);
    const picks = finalizePicks(raw, answers, cands, fb);
    return { picks, usedFallback: picks.some((p) => p.is_fallback) };
  } catch (err) {
    // AIが失敗したとき：ジャンルの対応表で代わりに選び、記録に「代替」と残す
    console.error('[select] AIの選定に失敗。対応表で代わりに選びます:', err instanceof Error ? err.message : err);
    return { picks: finalizePicks([], answers, cands, fb), usedFallback: true, error: String(err) };
  }
}
