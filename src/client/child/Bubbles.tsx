import { useEffect, useMemo, useRef, useState } from 'react';
import { KID_POS, PARENTS, emptyAnswers, kidsFor, type Answers, type KidQuestion, type ParentId } from '../../shared/questions';
import type { UnlockKey } from '../../shared/types';
import { useFieldLayout } from './Sky';

// 4.2 質問（シャボン玉）。弾け方A：ぷるん→パチン
const OPEN_MS = 430; // 弾けはじめてから小窓が開くまで
const DONE_MS = 950; // 弾けおわるまで
const GATHER_MS = 3000; // 星が集まる演出の長さ
const SPARKS = Array.from({ length: 12 }, (_, i) => i * 30);

type Phase = 'idle' | 'pop' | 'gone' | 'appear';

interface BubbleDef {
  id: string;
  isKid: boolean;
  short: string;
  q: string;
  opts: string[];
  x: number;
  y: number;
  size: number;
  delay: number;
  dur: number;
}

const parentDefs: BubbleDef[] = PARENTS.map((p) => ({ ...p, isKid: false }));

function kidDef(k: KidQuestion, i: number): BubbleDef {
  const pos = KID_POS[k.id];
  return { id: k.id, isKid: true, short: k.short, q: k.q, opts: k.opts, x: pos.x, y: pos.y, size: 66, delay: -i * 1.3, dur: 5.2 + i * 0.6 };
}

function activeKids(a: Answers): BubbleDef[] {
  return PARENTS.flatMap((p) => kidsFor(p.id, a.parents[p.id]).map((k, i) => kidDef(k, i)));
}

interface Props {
  initial: Answers | null;
  unlocks: UnlockKey[];
  onChange: (a: Answers) => void;
  onGo: (a: Answers) => Promise<void>;
  onDone: () => void;
}

export function Bubbles({ initial, unlocks, onChange, onGo, onDone }: Props) {
  const L = useFieldLayout();
  const [answers, setAnswers] = useState<Answers>(() => initial ?? emptyAnswers());
  const [phases, setPhases] = useState<Record<string, Phase>>(() => {
    const a = initial ?? emptyAnswers();
    const ph: Record<string, Phase> = {};
    for (const p of PARENTS) ph[p.id] = p.id in a.parents ? 'gone' : 'idle';
    for (const k of activeKids(a)) ph[k.id] = k.id in a.kids ? 'gone' : 'idle';
    return ph;
  });
  const [sheet, setSheet] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [screen, setScreen] = useState<'bubbles' | 'gather'>('bubbles');
  const [gathering, setGathering] = useState(false);
  const [waitMsg, setWaitMsg] = useState<string | null>(null);
  const [goError, setGoError] = useState<string | null>(null);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  const after = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const kids = useMemo(() => activeKids(answers), [answers]);
  const setPhase = (id: string, ph: Phase) => setPhases((s) => ({ ...s, [id]: ph }));

  const update = (next: Answers) => {
    setAnswers(next);
    onChange(next);
  };

  const tap = (b: BubbleDef) => {
    if (busy.current || screen !== 'bubbles' || (phases[b.id] ?? 'idle') !== 'idle') return;
    busy.current = true;
    setPhase(b.id, 'pop');
    after(OPEN_MS, () => {
      setSheet(b.id);
      setSel([]);
    });
    after(DONE_MS, () => setPhase(b.id, 'gone'));
  };

  const answerParent = (id: ParentId, label: string | null) => {
    busy.current = false;
    const next: Answers = { parents: { ...answers.parents, [id]: label }, kids: { ...answers.kids } };
    const born = kidsFor(id, label);
    setPhases((s) => {
      const ph = { ...s };
      born.forEach((k) => (ph[k.id] = 'appear'));
      return ph;
    });
    born.forEach((k) => after(650, () => setPhase(k.id, 'idle')));
    setSheet(null);
    setSel([]);
    update(next);
  };

  const answerKid = (id: string, list: string[]) => {
    busy.current = false;
    setSheet(null);
    setSel([]);
    update({ parents: answers.parents, kids: { ...answers.kids, [id]: list } });
  };

  const answeredParents = PARENTS.filter((p) => p.id in answers.parents).length;
  const allDone = answeredParents === PARENTS.length;
  const kidsLeft = kids.some((k) => !(k.id in answers.kids));

  const go = async () => {
    if (busy.current) return;
    busy.current = true;
    setGoError(null);
    setScreen('gather');
    after(80, () => setGathering(true));
    const started = Date.now();
    const slow = window.setTimeout(() => setWaitMsg('あなたへの動画を えらんでいます…'), GATHER_MS + 400);
    try {
      await onGo(answers);
      const rest = GATHER_MS - (Date.now() - started);
      window.setTimeout(onDone, Math.max(0, rest));
    } catch (e) {
      setGoError(e instanceof Error ? e.message : 'うまくいきませんでした');
      busy.current = false;
    } finally {
      clearTimeout(slow);
    }
  };

  // 星（答えた泡のあと）
  const center = (b: BubbleDef) => ({ x: L.mapX(b.x + b.size / 2), y: L.mapY(b.y + b.size / 2) });
  const stars = [
    ...parentDefs.filter((b) => b.id in answers.parents).map((b) => ({ id: b.id, small: false, ...center(b) })),
    ...kids.filter((b) => b.id in answers.kids).map((b) => ({ id: b.id, small: true, ...center(b) })),
  ];

  const renderBubble = (b: BubbleDef) => {
    const ph = phases[b.id] ?? 'idle';
    if (ph === 'gone') return null;
    const c = center(b);
    const d = b.size * L.scale;
    const cls = ['bubble', b.isKid ? 'child' : '', ph === 'pop' ? 'popA' : '', ph === 'appear' ? 'appear' : ''].filter(Boolean).join(' ');
    return (
      <div key={b.id} className="bwrap" style={{ left: c.x - d / 2, top: c.y - d / 2, width: d, height: d, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }}>
        <button className={cls} onClick={() => tap(b)} aria-label={b.q} disabled={screen !== 'bubbles'}>
          <span className="film" style={unlocks.includes('colors') ? { filter: `hue-rotate(${(b.x * 7) % 360}deg)` } : undefined} />
          <span className="shine" />
          <span className="blabel" style={{ fontSize: Math.round((b.isKid ? 12 : 14) * Math.min(1, Math.max(0.8, L.scale)) * 10) / 10 }}>
            {b.short}
          </span>
        </button>
        {ph === 'pop' && (
          <span className="fx">
            <span className="ringA" />
            {SPARKS.map((a) => (
              <span key={a} className="rot" style={{ transform: `rotate(${a}deg)` }}>
                <span className="sparkA" />
              </span>
            ))}
          </span>
        )}
      </div>
    );
  };

  const sheetDef = sheet ? (parentDefs.find((b) => b.id === sheet) ?? kids.find((b) => b.id === sheet)) : undefined;

  return (
    <div className={unlocks.includes('colors') ? 'frame colors' : 'frame'}>
      {screen === 'bubbles' && (
        <>
          <div className="topbar">
            <span className="logo">Human Library</span>
            <div className="dots" role="img" aria-label={`7つのうち ${answeredParents} こ こたえた`}>
              {PARENTS.map((p) => (
                <span key={p.id} className={p.id in answers.parents ? 'dot on' : 'dot'} />
              ))}
            </div>
          </div>
          <p className="prompt" style={{ top: `calc(${L.promptTop}px + env(safe-area-inset-top, 0px))`, fontSize: L.small ? 17 : 19 }}>
            今日のこと、
            <br />
            気になるシャボン玉からタップしてね
          </p>
          {parentDefs.map(renderBubble)}
          {kids.map(renderBubble)}
          <div className="bottombar">
            <span className="moon" aria-hidden="true" />
            {!allDone && <span className="note">のこり {PARENTS.length - answeredParents} こ</span>}
            {allDone && kidsLeft && (
              <span className="note" style={{ fontSize: 12 }}>
                小さな泡は
                <br />
                答えなくてもOK
              </span>
            )}
            {allDone && (
              <button className="goBtn" onClick={go}>
                一覧へ
              </button>
            )}
          </div>
        </>
      )}

      {stars.map((s) => (
        <span
          key={s.id}
          className={s.small ? 'star small' : 'star'}
          style={{ left: gathering ? L.center.x : s.x, top: gathering ? L.center.y : s.y }}
        />
      ))}

      {screen === 'gather' && (
        <>
          <div className="orb" style={{ left: L.center.x, top: L.center.y }} />
          <p className="gtext" style={{ top: L.center.y + 110 }}>
            あなたの今日は、
            <br />
            たくさんの仕事に
            <br />
            ささえられています
          </p>
          {waitMsg && !goError && (
            <p className="gwait" style={{ top: L.center.y + 200 }}>
              {waitMsg}
            </p>
          )}
          {goError && (
            <div className="gwait" style={{ top: L.center.y + 190, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <span>{goError}</span>
              <button className="btn" onClick={go}>
                もう一度
              </button>
            </div>
          )}
        </>
      )}

      {sheetDef && (
        <>
          <div className="scrim" />
          <div className="sheet" role="dialog" aria-modal="true" aria-label={sheetDef.q}>
            <h2>{sheetDef.q}</h2>
            {sheetDef.isKid && <p className="multi">いくつでも選べます</p>}
            <div className="opts">
              {sheetDef.opts.map((label) => {
                const on = sel.includes(label);
                const cls = ['opt', label.length > 7 ? 'long' : '', sheetDef.isKid && on ? 'on' : ''].filter(Boolean).join(' ');
                return (
                  <button
                    key={label}
                    className={cls}
                    aria-pressed={sheetDef.isKid ? on : undefined}
                    onClick={() =>
                      sheetDef.isKid ? setSel(on ? sel.filter((o) => o !== label) : [...sel, label]) : answerParent(sheetDef.id as ParentId, label)
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {sheetDef.isKid && (
              <button className="decide" disabled={!sel.length} onClick={() => answerKid(sheetDef.id, sel.slice())}>
                決定
              </button>
            )}
            <button className="skip" onClick={() => (sheetDef.isKid ? answerKid(sheetDef.id, []) : answerParent(sheetDef.id as ParentId, null))}>
              こたえずに進む
            </button>
          </div>
        </>
      )}
    </div>
  );
}
