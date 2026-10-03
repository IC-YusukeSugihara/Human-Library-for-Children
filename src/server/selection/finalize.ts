import type { Answers } from '../../shared/questions';
import { answerRoots } from '../../shared/questions';
import { LABEL_GENERAL, ROOT_GENERAL, ROOT_INFRA } from '../../shared/genres';
import type { SelectionKind } from '../../shared/types';
import { infraRange, targetCount, type Candidate, type Pick } from './fallback';

export interface RawPick {
  video_id: string;
  label: string;
  path: string[];
  kind: SelectionKind | string;
}

const THEME = 'テーマ:';

// AIの出力を7章のルールに合わせて整える。合わないところは代替（ジャンルの対応表）で埋め、is_fallback を付ける。
export function finalizePicks(raw: RawPick[], answers: Answers, cands: Candidate[], fallback: Pick[]): Pick[] {
  const byId = new Map(cands.map((c) => [c.id, c]));
  const roots = answerRoots(answers);
  const rootByKey = new Map(roots.map((r) => [r.root, r]));
  const rootByLabel = new Map(roots.map((r) => [r.label, r]));
  const out: Pick[] = [];
  const used = new Set<string>();

  for (const p of raw) {
    const c = byId.get(String(p.video_id ?? '').trim());
    if (!c || used.has(c.id)) continue;
    used.add(c.id);
    const path = Array.isArray(p.path) ? p.path.map((s) => String(s).trim()).filter(Boolean) : [];
    // 起点：path の先頭が今日の回答ならそれを、違えばラベルから探す
    const root = rootByKey.get(path[0]) ?? rootByLabel.get(String(p.label ?? '').trim());
    const middle = path
      .slice(1)
      .filter((s) => s.startsWith(THEME) && s.length > THEME.length && s !== `${THEME}${c.cat}`)
      .slice(0, 2);
    const tail = [`${THEME}${c.cat}`, `video:${c.id}`];

    let kind: SelectionKind;
    let label: string;
    let fullPath: string[];
    if (c.is_infra) {
      kind = 'infra';
      label = LABEL_GENERAL;
      fullPath = root ? [root.root, ...middle, ...tail] : [ROOT_INFRA, ...tail];
    } else if (root && p.kind !== 'general') {
      kind = 'related';
      label = root.label;
      fullPath = [root.root, ...middle, ...tail];
    } else {
      kind = 'general';
      label = LABEL_GENERAL;
      fullPath = [ROOT_GENERAL, ...tail];
    }
    out.push({ video_id: c.id, label, path: fullPath, kind, is_fallback: false });
  }

  const target = targetCount(cands);
  const { min: infraMin, max: infraMax } = infraRange(cands);
  const infraOf = (list: Pick[]) => list.filter((p) => p.kind === 'infra');
  // 代替の候補：対応表で選んだ順、そのあとに残りの全候補
  const spare = fallback.filter((p) => byId.has(p.video_id));
  for (const c of cands) {
    if (spare.some((p) => p.video_id === c.id)) continue;
    spare.push(
      c.is_infra
        ? { video_id: c.id, label: LABEL_GENERAL, path: [ROOT_INFRA, `${THEME}${c.cat}`, `video:${c.id}`], kind: 'infra', is_fallback: true }
        : { video_id: c.id, label: LABEL_GENERAL, path: [ROOT_GENERAL, `${THEME}${c.cat}`, `video:${c.id}`], kind: 'general', is_fallback: true },
    );
  }
  const nextSpare = (wantInfra: boolean) => {
    const s = spare.find((p) => !used.has(p.video_id) && (p.kind === 'infra') === wantInfra);
    if (s) used.add(s.video_id);
    return s ? { ...s, is_fallback: true } : undefined;
  };

  // インフラが多すぎるとき：あとの方から外す
  while (infraOf(out).length > infraMax) {
    const last = infraOf(out).pop()!;
    out.splice(out.indexOf(last), 1);
  }
  // 多すぎる分を切る（インフラ以外のあとの方から）
  while (out.length > target) {
    const idx = out.map((p) => p.kind !== 'infra').lastIndexOf(true);
    out.splice(idx >= 0 ? idx : out.length - 1, 1);
  }
  // インフラが足りないとき：関係のない動画、なければ関係のある動画のあとの方と入れ替える
  while (infraOf(out).length < infraMin) {
    const s = nextSpare(true);
    if (!s) break;
    if (out.length < target) {
      out.push(s);
      continue;
    }
    let idx = out.map((p) => p.kind === 'general').lastIndexOf(true);
    if (idx < 0) idx = out.map((p) => p.kind === 'related').lastIndexOf(true);
    if (idx < 0) break;
    out.splice(idx, 1, s);
  }
  // 本数が足りないとき：代替で埋める
  while (out.length < target) {
    const s = nextSpare(false) ?? (infraOf(out).length < infraMax ? nextSpare(true) : undefined);
    if (!s) break;
    out.push(s);
  }
  return out;
}

// 7章のルールを満たしているか（テストと記録の確認用）
export function checkRules(picks: Pick[], cands: Candidate[], seen: Set<string>): string[] {
  const errors: string[] = [];
  const byId = new Map(cands.map((c) => [c.id, c]));
  const { min, max } = infraRange(cands);
  const target = targetCount(cands);
  if (picks.length !== target) errors.push(`本数が ${picks.length}（${target} のはず）`);
  const infra = picks.filter((p) => byId.get(p.video_id)?.is_infra).length;
  if (infra < min || infra > max) errors.push(`インフラが ${infra} 本（${min}〜${max} のはず）`);
  if (new Set(picks.map((p) => p.video_id)).size !== picks.length) errors.push('同じ動画が重複');
  for (const p of picks) {
    if (!byId.has(p.video_id)) errors.push(`候補にない動画 ${p.video_id}`);
    if (seen.has(p.video_id)) errors.push(`見た動画 ${p.video_id}`);
    if (p.kind !== 'related' && p.label !== LABEL_GENERAL) errors.push(`ラベル違反 ${p.video_id}`);
    if (p.kind === 'related' && !/^.+（.+）から$/.test(p.label)) errors.push(`ラベル形式違反 ${p.video_id}`);
    if (p.path[p.path.length - 1] !== `video:${p.video_id}`) errors.push(`path の末尾違反 ${p.video_id}`);
  }
  return errors;
}
