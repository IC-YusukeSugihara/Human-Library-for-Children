import { useEffect, useMemo, useState } from 'react';
import type { UnlockKey } from '../../shared/types';

// 画面見本と同じ並びの星（種のある乱数）
function makeStars(count: number) {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  return Array.from({ length: count }, () => ({
    x: rnd() * 100,
    y: rnd() * 100,
    s: rnd() < 0.2 ? 3 : 1.5,
    d: -Math.round(rnd() * 320) / 100,
  }));
}

export function Sky({ unlocks }: { unlocks: UnlockKey[] }) {
  const stars = useMemo(() => makeStars(45), []);
  return (
    <>
      <div className={unlocks.includes('bright') ? 'sky bright' : 'sky'} />
      {stars.map((k, i) => (
        <span key={i} className="tw" style={{ left: `${k.x}%`, top: `${k.y}%`, width: k.s, height: k.s, animationDelay: `${k.d}s` }} />
      ))}
      {unlocks.includes('meteor') && (
        <>
          <span className="meteor" style={{ left: '78%', top: '12%' }} />
          <span className="meteor" style={{ left: '96%', top: '30%', animationDelay: '-4.5s' }} />
        </>
      )}
    </>
  );
}

export function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener('resize', on);
    window.visualViewport?.addEventListener('resize', on);
    return () => {
      window.removeEventListener('resize', on);
      window.visualViewport?.removeEventListener('resize', on);
    };
  }, []);
  return vp;
}

// 画面見本（390×844）の座標を、実際の画面に合わせて置き直す
export function useFieldLayout() {
  const { w, h } = useViewport();
  const W = Math.min(w, 480);
  const sx = W / 390;
  const small = h < 700;
  const top = small ? 128 : 160;
  const bottom = small ? 96 : 124;
  const Y0 = 165; // 見本で泡が置かれる範囲（上端）
  const Y1 = 716; // 同（下端）
  const syRaw = (h - top - bottom) / (Y1 - Y0);
  const sy = Math.min(syRaw, sx * 1.15);
  const extra = Math.max(0, (h - top - bottom - (Y1 - Y0) * sy) / 2);
  const ss = Math.max(0.7, Math.min(1.12, Math.min(sx, sy)));
  return {
    W,
    h,
    small,
    promptTop: small ? 58 : 74,
    mapX: (x: number) => x * sx,
    mapY: (y: number) => top + extra + (y - Y0) * sy,
    scale: ss,
    center: { x: W / 2, y: top + extra + (400 - Y0) * sy },
  };
}
