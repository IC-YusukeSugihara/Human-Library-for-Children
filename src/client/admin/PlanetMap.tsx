import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactElement, type WheelEvent as RWheelEvent } from 'react';
import { api } from '../api';
import { FIELDS, type Field } from '../../shared/genres';
import type { MapLink, MapNode, PlanetMap } from '../../server/planetMap';

// 5.2 テーマのつながり（惑星マップ）
// 恒星＝回答（大きさ＝選ばれた回数）、惑星＝表示されたテーマ（大きさ＝表示回数、色＝分野）、線＝つながり（太さ＝回数）

interface Placed extends MapNode {
  x: number;
  y: number;
  d: number;
}

const LEGEND: Field[] = ['food', 'move', 'learn', 'home', 'infra', 'link'];

function placeNodes(map: PlanetMap, W: number, H: number, mobile: boolean): Map<string, Placed> {
  const rx = W * (mobile ? 0.456 : 0.466);
  const ry = H * (mobile ? 0.443 : 0.453);
  const cx = W / 2;
  const cy = H / 2;
  const scale = mobile ? 0.62 : 1;
  // 恒星が多いときは、内側の輪を広げて重ならないようにする（画面見本の 0.3／0.62／0.92 が基準）
  const starCount = map.nodes.filter((n) => n.type === 'answer').length;
  const base = mobile ? 0.36 : 0.3;
  const r0 = Math.min(0.55, Math.max(base, (starCount * (mobile ? 46 : 78)) / (2 * Math.PI * ((rx + ry) / 2))));
  const rings = [r0, (r0 + 0.92) / 2, mobile ? 0.93 : 0.92];
  const ringOf = (n: MapNode) => (n.type === 'answer' ? 0 : Math.min(2, n.depth));
  const maxA = Math.max(1, ...map.nodes.filter((n) => n.type === 'answer').map((n) => n.n));
  const maxT = Math.max(1, ...map.nodes.filter((n) => n.type === 'theme').map((n) => n.n));
  const size = (n: MapNode) => (n.type === 'answer' ? 30 + 34 * Math.sqrt(n.n / maxA) : 14 + 30 * Math.sqrt(n.n / maxT)) * scale;

  const angle = new Map<string, number>();
  const stars = map.nodes.filter((n) => n.type === 'answer');
  stars.forEach((s, i) => angle.set(s.id, -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, stars.length)));

  // 恒星から近い順に、つながっている元の向きの平均に置く
  const themes = map.nodes.filter((n) => n.type === 'theme').sort((a, b) => a.depth - b.depth);
  for (let pass = 0; pass < 3; pass++) {
    for (const t of themes) {
      let sx = 0;
      let sy = 0;
      for (const l of map.links) {
        if (l.to !== t.id) continue;
        const a = angle.get(l.from);
        if (a === undefined) continue;
        sx += Math.cos(a) * l.n;
        sy += Math.sin(a) * l.n;
      }
      if (sx || sy) angle.set(t.id, Math.atan2(sy, sx));
    }
  }
  // どこからもつながらないもの（インフラ枠など）は、あいているところに等間隔で
  const loose = themes.filter((t) => !angle.has(t.id));
  loose.forEach((t, i) => angle.set(t.id, Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / Math.max(1, loose.length)));

  // 同じ輪の上で重ならないように、少しずつ押し広げる
  const placed = new Map<string, Placed>();
  for (let ring = 0; ring < 3; ring++) {
    const list = map.nodes.filter((n) => ringOf(n) === ring).map((n) => ({ n, a: angle.get(n.id) ?? 0, d: size(n) }));
    if (!list.length) continue;
    const R = ((rx + ry) / 2) * rings[ring];
    for (let it = 0; it < 80; it++) {
      list.sort((p, q) => p.a - q.a);
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const q = list[(i + 1) % list.length];
        if (p === q) break;
        let gap = q.a - p.a;
        if (gap <= 0) gap += 2 * Math.PI;
        const need = Math.min((2 * Math.PI) / list.length, ((p.d + q.d) / 2 + (mobile ? 26 : 40)) / R);
        if (gap < need) {
          const push = (need - gap) / 2;
          p.a -= push;
          q.a += push;
        }
      }
    }
    for (const { n, a, d } of list) {
      placed.set(n.id, { ...n, d, x: cx + rx * rings[ring] * Math.cos(a), y: cy + ry * rings[ring] * Math.sin(a) });
    }
  }
  return placed;
}

export function PlanetMapView() {
  const [map, setMap] = useState<PlanetMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState({ s: 1, tx: 0, ty: 0 });
  const [box, setBox] = useState({ w: 880, h: 728 });
  const area = useRef<HTMLDivElement>(null);
  const ptrs = useRef<Record<number, { x: number; y: number }>>({});
  const start = useRef<{ v: typeof view; ptrs: Record<number, { x: number; y: number }> } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    api
      .get<PlanetMap>('/api/admin/map')
      .then(setMap)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  const mobile = box.w < 600;
  const placed = useMemo(() => (map ? placeNodes(map, box.w, box.h, mobile) : new Map<string, Placed>()), [map, box.w, box.h, mobile]);
  // 同じ答え（例：朝ごはんの「魚」と夜ごはんの「魚」）は、どの質問の答えかを添えて見分ける
  const labelOf = useMemo(() => {
    const count = new Map<string, number>();
    map?.nodes.forEach((n) => count.set(n.label, (count.get(n.label) ?? 0) + 1));
    return (n: MapNode) => (n.type === 'answer' && (count.get(n.label) ?? 0) > 1 && n.detail ? `${n.label}（${n.detail.split('：')[0]}）` : n.label);
  }, [map]);

  const clampS = (v: number) => Math.max(0.6, Math.min(3.2, v));
  const local = (e: { clientX: number; clientY: number }) => {
    const r = area.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const snap = () => ({ v: { ...view }, ptrs: JSON.parse(JSON.stringify(ptrs.current)) });
  const zoomAt = (f: number, px: number, py: number) =>
    setView((v) => {
      const s = clampS(v.s * f);
      return { s, tx: px - ((px - v.tx) / v.s) * s, ty: py - ((py - v.ty) / v.s) * s };
    });

  const pDown = (e: RPointerEvent) => {
    if (Object.keys(ptrs.current).length === 0) dragged.current = false;
    ptrs.current[e.pointerId] = local(e);
    start.current = snap();
  };
  const pMove = (e: RPointerEvent) => {
    if (!(e.pointerId in ptrs.current) || !start.current) return;
    ptrs.current[e.pointerId] = local(e);
    const ids = Object.keys(ptrs.current).map(Number);
    const g = start.current;
    if (ids.length === 1) {
      const p0 = g.ptrs[ids[0]];
      const p = ptrs.current[ids[0]];
      if (!p0) return;
      const dx = p.x - p0.x;
      const dy = p.y - p0.y;
      if (!dragged.current && Math.abs(dx) + Math.abs(dy) < 6) return;
      dragged.current = true;
      setView({ s: g.v.s, tx: g.v.tx + dx, ty: g.v.ty + dy });
    } else {
      const a0 = g.ptrs[ids[0]];
      const b0 = g.ptrs[ids[1]];
      if (!a0 || !b0) return;
      const A = ptrs.current[ids[0]];
      const B = ptrs.current[ids[1]];
      const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
      const d1 = Math.hypot(B.x - A.x, B.y - A.y);
      const s = clampS((g.v.s * d1) / d0);
      const wx = ((a0.x + b0.x) / 2 - g.v.tx) / g.v.s;
      const wy = ((a0.y + b0.y) / 2 - g.v.ty) / g.v.s;
      dragged.current = true;
      setView({ s, tx: (A.x + B.x) / 2 - wx * s, ty: (A.y + B.y) / 2 - wy * s });
    }
  };
  const pUp = (e: RPointerEvent) => {
    if (!(e.pointerId in ptrs.current)) return;
    delete ptrs.current[e.pointerId];
    start.current = snap();
  };
  const wheel = (e: RWheelEvent) => {
    const p = local(e);
    zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  };
  // ホイールでページがスクロールしないように
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const stop = (ev: WheelEvent) => ev.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, [map]);

  if (error) return <p className="emptyA">{error}</p>;
  if (!map) return <p className="emptyA">読みこみ中…</p>;

  const related = new Set<string>();
  if (sel) {
    related.add(sel);
    map.links.forEach((l) => {
      if (l.from === sel) related.add(l.to);
      if (l.to === sel) related.add(l.from);
    });
  }
  const maxL = Math.max(1, ...map.links.map((l) => l.n));
  const byId = (id: string) => placed.get(id);
  const themes = map.nodes.filter((n) => n.type === 'theme').sort((a, b) => b.n - a.n);
  const selNode = sel ? map.nodes.find((n) => n.id === sel) : undefined;

  const linkRow = (l: MapLink, dir: 'in' | 'out') => {
    const other = map.nodes.find((n) => n.id === (dir === 'in' ? l.from : l.to));
    return (
      <button key={`${l.from}-${l.to}`} className="trow2" onClick={() => setSel(other?.id ?? null)}>
        <span>
          {other ? labelOf(other) : ''}
          {dir === 'in' ? ' から' : ' へ'}
        </span>
        <span className="cnt">{l.n}回</span>
      </button>
    );
  };

  return (
    <div className="mapWrap">
      <div className="mapCol">
      <div
        className="mapArea"
        ref={area}
        onPointerDown={pDown}
        onPointerMove={pMove}
        onPointerUp={pUp}
        onPointerCancel={pUp}
        onPointerLeave={pUp}
        onWheel={wheel}
        onClick={() => {
          if (!dragged.current) setSel(null);
        }}
      >
        <div className="mapLayer" style={{ width: box.w, height: box.h, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})` }}>
          {map.links.map((l) => {
            const A = byId(l.from);
            const B = byId(l.to);
            if (!A || !B) return null;
            const dx = B.x - A.x;
            const dy = B.y - A.y;
            const on = !!sel && (l.from === sel || l.to === sel);
            const w = (1 + (4 * l.n) / maxL) * (mobile ? 0.75 : 1) * (on ? 1.3 : 1);
            return (
              <span
                key={`${l.from}-${l.to}`}
                className={on ? 'link on' : sel ? 'link dim' : 'link'}
                style={{ left: A.x, top: A.y, width: Math.hypot(dx, dy), height: w, marginTop: -w / 2, transform: `rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}deg)` }}
              />
            );
          })}
          {[...placed.values()].map((nd) => {
            const f = FIELDS[nd.field];
            const isA = nd.type === 'answer';
            const dim = !!sel && !related.has(nd.id);
            return (
              <span key={nd.id}>
                <button
                  className={[isA ? 'node starN' : 'node', sel === nd.id ? 'sel' : '', dim ? 'dim' : ''].filter(Boolean).join(' ')}
                  style={{
                    left: nd.x - nd.d / 2,
                    top: nd.y - nd.d / 2,
                    width: nd.d,
                    height: nd.d,
                    background: isA
                      ? 'radial-gradient(circle at 50% 50%, #FFFFFF 0%, #FFF6D6 28%, rgba(246,211,138,0.55) 55%, rgba(246,211,138,0) 72%)'
                      : `radial-gradient(circle at 34% 30%, #FFFFFF 0%, ${f.c} 32%, ${f.dark} 100%)`,
                    boxShadow: isA ? 'none' : `0 0 ${Math.round(nd.d * 0.5)}px ${f.c}66`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dragged.current) return;
                    setSel(sel === nd.id ? null : nd.id);
                  }}
                  aria-label={`${labelOf(nd)}（${isA ? '選ばれた回数' : '表示回数'} ${nd.n}回）`}
                />
                <span className={[isA ? 'nlabel strong' : 'nlabel', dim ? 'dim' : ''].filter(Boolean).join(' ')} style={{ left: nd.x, top: nd.y + nd.d / 2 + (isA ? -4 : 3) }}>
                  {labelOf(nd)}
                </span>
              </span>
            );
          })}
        </div>
        <p className="maphint">{mobile ? '指でずらす／2本指か＋−で拡大' : 'ドラッグで移動／ホイールか＋−で拡大'}</p>
        {map.nodes.length === 0 && <p className="emptyA" style={{ position: 'absolute', inset: 0, margin: '45% 0 0' }}>まだ選定の記録がありません。子どもが「一覧へ」を押すと、ここに表示されます。</p>}
        <div className="zoom" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button className="zbtn" onClick={() => zoomAt(1.3, box.w / 2, box.h / 2)} aria-label="拡大">
            ＋
          </button>
          <button className="zbtn" onClick={() => zoomAt(1 / 1.3, box.w / 2, box.h / 2)} aria-label="縮小">
            −
          </button>
          <button className="zbtn small" onClick={() => setView({ s: 1, tx: 0, ty: 0 })} aria-label="元の大きさに戻す">
            元に
            <br />
            戻す
          </button>
        </div>
      </div>
      <div className="legend">
          {LEGEND.map((k) => (
            <span key={k} className="lg">
              <span className="dotc" style={{ background: FIELDS[k].c }} />
              {FIELDS[k].name}
            </span>
          ))}
          <span className="lg">
            <span className="dotc" style={{ background: '#FFF6D6', boxShadow: '0 0 6px #F6D38A' }} />
            恒星＝回答
          </span>
          <span className="lg">線の太さ＝つながった回数</span>
        </div>
      </div>

      <div className="mapPanel">
        {!selNode ? (
          <>
            <h2>表示されたテーマ</h2>
            <p className="lead" style={{ margin: '6px 0 12px' }}>
              惑星か行をタップすると、つながりを表示します（選定 {map.totalSelections} 件から集計）
            </p>
            <div className="trow head">
              <span />
              <span>テーマ</span>
              <span>分野</span>
              <span>表示回数</span>
            </div>
            {themes.map((t) => (
              <button key={t.id} className="trow" onClick={() => setSel(t.id)}>
                <span className="dotc" style={{ background: FIELDS[t.field].c }} />
                <span>{t.label}</span>
                <span style={{ color: 'var(--sub)', fontSize: 12 }}>{FIELDS[t.field].name}</span>
                <span className="cnt">{t.n}回</span>
              </button>
            ))}
          </>
        ) : (
          <Detail map={map} node={selNode} onBack={() => setSel(null)} linkRow={linkRow} />
        )}
      </div>
    </div>
  );
}

function Detail({ map, node, onBack, linkRow }: { map: PlanetMap; node: MapNode; onBack: () => void; linkRow: (l: MapLink, dir: 'in' | 'out') => ReactElement }) {
  const isA = node.type === 'answer';
  const f = FIELDS[node.field];
  const ins = map.links.filter((l) => l.to === node.id).sort((a, b) => b.n - a.n);
  const outs = map.links.filter((l) => l.from === node.id).sort((a, b) => b.n - a.n);
  const slot = map.slots[node.id];
  return (
    <>
      <button className="backLink" onClick={onBack}>
        ← 一覧にもどる
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
        <span className="dotc" style={{ width: 14, height: 14, background: f.c }} />
        <h2>{node.label}</h2>
        <span className="chip2">{f.name}</span>
      </div>
      {node.detail && <p className="lead" style={{ margin: '6px 0 0' }}>{node.detail}</p>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
        <span style={{ color: 'var(--sub)', fontSize: 13 }}>{isA ? '選ばれた回数' : '表示回数'}</span>
        <span className="cnt" style={{ fontSize: 26 }}>
          {node.n}回
        </span>
      </div>
      {(ins.length > 0 || slot) && (
        <>
          <h3 className="sub">どこから来たか（多い順）</h3>
          {[
            ...ins.map((l) => ({ n: l.n, el: linkRow(l, 'in') })),
            ...(slot?.infra
              ? [{ n: slot.infra, el: <div key="infra" className="trow2 static"><span>インフラ枠（回答と関係なく表示）</span><span className="cnt">{slot.infra}回</span></div> }]
              : []),
            ...(slot?.general
              ? [{ n: slot.general, el: <div key="general" className="trow2 static"><span>回答と関係のない仕事として表示</span><span className="cnt">{slot.general}回</span></div> }]
              : []),
          ]
            .sort((a, b) => b.n - a.n)
            .map((x) => x.el)}
        </>
      )}
      {outs.length > 0 && (
        <>
          <h3 className="sub">{isA ? 'つながったテーマ（多い順）' : 'つながる先'}</h3>
          {outs.map((l) => linkRow(l, 'out'))}
        </>
      )}
    </>
  );
}
