import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { MeState, Notice, VideoCard } from '../../shared/types';
import { thumb } from '../api';
import { useViewport } from './Sky';
import { MyPage } from './MyPage';
import { History } from './History';

const R = 220; // 輪の半径（画面見本どおり）

const Chevron = ({ up }: { up?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
  </svg>
);

interface Gesture {
  x: number;
  y: number;
  mode: 'h' | 'v' | null;
  rot0: number;
  moved: boolean;
  active: boolean;
}

interface Props {
  me: MeState;
  selection: VideoCard[];
  notices: Notice[];
  startPage: number;
  historyKey: number;
  onPlay: (v: { video_id: string; title: string; summary: string; label: string | null }) => void;
}

export function Home({ me, selection, notices, startPage, historyKey, onPlay }: Props) {
  const { h } = useViewport();
  const [page, setPage] = useState(startPage);
  const [rot, setRot] = useState(0);
  const [dragRing, setDragRing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragV, setDragV] = useState(false);
  const g = useRef<Gesture | null>(null);

  useEffect(() => setPage(startPage), [startPage]);

  const n = Math.max(selection.length, 1);
  const step = 360 / n;
  const fi = ((Math.round(-rot / step) % n) + n) % n;
  const front = selection[fi];
  const k = Math.max(0.66, Math.min(1, (h - 400) / 444)); // 背の低い画面では輪を小さくする

  const bringFront = (i: number) => {
    if (g.current?.moved) return;
    if (i === fi && front) {
      onPlay({ video_id: front.video_id, title: front.title, summary: front.summary, label: front.label });
      return;
    }
    const target = -i * step;
    const turns = Math.round((rot - target) / 360);
    setRot(target + 360 * turns);
  };

  const down = (e: RPointerEvent) => {
    // スクロールする場所や、押せる部品の上では、ページ送りをしない
    if ((e.target as HTMLElement).closest('.scroller, input, textarea')) return;
    g.current = { x: e.clientX, y: e.clientY, mode: null, rot0: rot, moved: false, active: true };
  };
  const move = (e: RPointerEvent) => {
    const s = g.current;
    if (!s || !s.active) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.mode) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      s.moved = true;
    }
    if (s.mode === 'h') {
      if (page !== 1) return;
      setRot(s.rot0 + dx * 0.35);
      setDragRing(true);
    } else {
      const edge = (page === 0 && dy > 0) || (page === 2 && dy < 0);
      setDragY(dy * (edge ? 0.15 : 0.6));
      setDragV(true);
    }
  };
  const up = (e: RPointerEvent) => {
    const s = g.current;
    if (!s || !s.active) return;
    s.active = false;
    if (s.mode === 'h') {
      setRot(Math.round(rot / step) * step);
      setDragRing(false);
    } else if (s.mode === 'v') {
      const dy = e.clientY - s.y;
      let p = page;
      if (dy > 60 && p > 0) p -= 1;
      else if (dy < -60 && p < 2) p += 1;
      setPage(p);
      setDragY(0);
      setDragV(false);
    }
    window.setTimeout(() => {
      if (g.current === s) g.current = null;
    }, 60);
  };

  const hint = (label: string, to: number, upArrow: boolean): ReactNode => (
    <button className="hint" onClick={() => setPage(to)}>
      <Chevron up={upArrow} />
      <span>{label}</span>
    </button>
  );

  const cards = selection.map((c, i) => {
    const t = ((i * step + rot) * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const z = R * (cos - 1) * 1.1;
    const f = Math.pow((cos + 1) / 2, 1.6);
    return (
      <button
        key={c.video_id}
        className={i === fi ? 'card front' : 'card'}
        style={{
          transform: `translate3d(${(R * sin).toFixed(1)}px, ${(-(1 - cos) * 30).toFixed(1)}px, ${z.toFixed(1)}px)`,
          opacity: (0.25 + 0.75 * f).toFixed(2),
          zIndex: Math.round(1000 + z),
        }}
        onClick={() => bringFront(i)}
        aria-label={i === fi ? `${c.title}（タップで再生）` : c.title}
      >
        <span className="thumb">
          <img src={thumb(c.video_id)} alt="" loading="lazy" draggable={false} />
          {c.watched && <span className="seen">みた</span>}
        </span>
        <span className="ctitle">{c.title}</span>
      </button>
    );
  });

  return (
    <div className="frame" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className={dragV ? 'stack drag' : 'stack'} style={{ transform: `translateY(${(-page * h + dragY).toFixed(1)}px)` }}>
        <section className="page" style={{ height: h }} aria-hidden={page !== 0} inert={page !== 0}>
          <MyPage me={me} notices={notices} footer={hint('上に払うと一覧へ', 1, false)} />
        </section>

        <section className="page" style={{ height: h }} aria-hidden={page !== 1} inert={page !== 1}>
          <div className="listPage">
            {hint('下に引くとマイページ', 0, true)}
            <div className="listHead">
              <h2>今日のおすすめ</h2>
              <p>よこにスワイプして、1本えらんでね</p>
            </div>
            {me.watchedToday.length > 0 && (
              <div className="doneBanner" style={{ marginTop: 8 }}>
                今日はここまで。また明日ね。
                <small>見たいときは、もう1本見てもだいじょうぶ。</small>
              </div>
            )}
            {selection.length === 0 ? (
              <p className="empty" style={{ padding: '40px 24px' }}>
                今日えらべる動画がありませんでした。また明日ひらいてね。
              </p>
            ) : (
              <>
                <div className="ringBox" style={{ height: 360 * k }}>
                  <div className={dragRing ? 'ring drag' : 'ring'} style={{ transform: `scale(${k})` }}>
                    {cards}
                  </div>
                </div>
                {front && (
                  <div className="info">
                    <div className="row">
                      <span className="chip">{front.label}</span>
                      <span className="no">
                        {fi + 1} / {selection.length}
                      </span>
                    </div>
                    <h3>{front.title}</h3>
                    <p>{front.summary}</p>
                    <button className="playBtn" onClick={() => onPlay({ video_id: front.video_id, title: front.title, summary: front.summary, label: front.label })}>
                      ▶ この動画を見る
                    </button>
                  </div>
                )}
              </>
            )}
            {hint('上に払うと履歴', 2, false)}
          </div>
        </section>

        <section className="page" style={{ height: h }} aria-hidden={page !== 2} inert={page !== 2}>
          <History header={hint('下に引くと一覧へ', 1, true)} refreshKey={historyKey} onPlay={onPlay} />
        </section>
      </div>
    </div>
  );
}
