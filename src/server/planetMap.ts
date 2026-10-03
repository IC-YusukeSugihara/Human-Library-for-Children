import { answerRoots, sanitizeAnswers } from '../shared/questions';
import { fieldOfCat, ROOT_GENERAL, ROOT_INFRA, type Field } from '../shared/genres';

// 5.2 テーマのつながり（惑星マップ）：7章の「選んだ理由の記録（path）」から作る

export interface MapNode {
  id: string;
  label: string;
  type: 'answer' | 'theme';
  field: Field;
  n: number; // 恒星＝選ばれた回数、惑星＝表示回数
  depth: number; // 恒星からいくつ目か（配置に使う）
  detail?: string; // 恒星：「朝ごはん：パン」
}

export interface MapLink {
  from: string;
  to: string;
  n: number;
}

export interface PlanetMap {
  nodes: MapNode[];
  links: MapLink[];
  // 回答と関係なく表示された回数（インフラ枠・くらし枠）
  slots: Record<string, { infra: number; general: number }>;
  totalSelections: number;
}

const THEME = 'テーマ:';

export function buildPlanetMap(paths: string[][], dayAnswers: unknown[], cats: Set<string>): PlanetMap {
  const nodes = new Map<string, MapNode>();
  const links = new Map<string, MapLink>();
  const slots: PlanetMap['slots'] = {};

  // 恒星の大きさ：その答えが選ばれた回数（日ごとの回答から数える）
  const chosen = new Map<string, number>();
  for (const a of dayAnswers) {
    for (const r of answerRoots(sanitizeAnswers(a))) chosen.set(r.root, (chosen.get(r.root) ?? 0) + 1);
  }

  const themeNode = (name: string, depth: number) => {
    const id = `t:${name}`;
    let nd = nodes.get(id);
    if (!nd) {
      nd = { id, label: name, type: 'theme', field: cats.has(name) ? fieldOfCat(name) : 'link', n: 0, depth };
      nodes.set(id, nd);
    }
    nd.depth = Math.min(nd.depth, depth);
    return nd;
  };
  const link = (from: string, to: string) => {
    const key = `${from}→${to}`;
    const l = links.get(key) ?? { from, to, n: 0 };
    l.n++;
    links.set(key, l);
  };

  for (const path of paths) {
    const els = path.filter((s) => !s.startsWith('video:'));
    if (!els.length) continue;
    const [root, ...rest] = els;
    const themes = rest.filter((s) => s.startsWith(THEME)).map((s) => s.slice(THEME.length)).filter(Boolean);
    if (!themes.length) continue;
    const special = root === ROOT_INFRA || root === ROOT_GENERAL;
    const ids: string[] = [];
    if (!special) {
      const id = `a:${root}`;
      if (!nodes.has(id)) {
        const [question, answer] = root.split(':');
        nodes.set(id, { id, label: answer ?? root, type: 'answer', field: 'answer', n: 0, depth: 0, detail: `${question}：${answer}` });
      }
      ids.push(id);
    }
    // 1つの選定の中で同じテーマを2回数えない
    const seen = new Set<string>();
    themes.forEach((t, i) => {
      const nd = themeNode(t, special ? i + 2 : i + 1);
      if (!seen.has(nd.id)) nd.n++;
      seen.add(nd.id);
      ids.push(nd.id);
    });
    if (special) {
      const s = (slots[ids[0]] ??= { infra: 0, general: 0 });
      if (root === ROOT_INFRA) s.infra++;
      else s.general++;
    }
    for (let i = 0; i + 1 < ids.length; i++) if (ids[i] !== ids[i + 1]) link(ids[i], ids[i + 1]);
  }

  for (const nd of nodes.values()) {
    if (nd.type === 'answer') {
      const root = nd.id.slice(2);
      nd.n = chosen.get(root) ?? [...links.values()].filter((l) => l.from === nd.id).reduce((s, l) => s + l.n, 0);
    }
  }

  return { nodes: [...nodes.values()], links: [...links.values()], slots, totalSelections: paths.length };
}
