import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/child.css';
import { unlockedKeys, type MeState, type Notice, type VideoCard } from '../../shared/types';
import type { Answers } from '../../shared/questions';
import { api } from '../api';
import { Sky } from './Sky';
import { Register } from './Register';
import { Bubbles } from './Bubbles';
import { Home } from './Home';
import { Player, type PlayTarget } from './Player';
import { NoticeModal } from './Notices';

export function ChildApp() {
  const [me, setMe] = useState<MeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<VideoCard[] | null>(null);
  const [showHome, setShowHome] = useState(false);
  const [playing, setPlaying] = useState<PlayTarget | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [modal, setModal] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const saveTimer = useRef<number | undefined>(undefined);
  const appRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const m = await api.get<MeState>('/api/me');
      setMe(m);
      setSelection(m.selection);
      setShowHome(!!m.selection);
      if (m.notices.length) {
        setNotices(m.notices);
        setModal(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'うまくいきませんでした');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 回答は1つずつサーバーに保存する（途中で閉じても続きから答えられるように）
  const saveAnswers = (a: Answers) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      api.put('/api/today/answers', { answers: a }).catch(() => {});
    }, 300);
  };

  const select = async (a: Answers) => {
    window.clearTimeout(saveTimer.current);
    const r = await api.post<{ selection: VideoCard[] }>('/api/today/select', { answers: a });
    setSelection(r.selection);
  };

  const closeModal = () => {
    setModal(false);
    api.post('/api/notices/seen', { ids: notices.map((n) => n.id) }).catch(() => {});
  };

  const closePlayer = async () => {
    setPlaying(null);
    appRef.current?.scrollTo(0, 0);
    setHistoryKey((k) => k + 1);
    try {
      const m = await api.get<MeState>('/api/me');
      setMe(m);
      if (m.selection) setSelection(m.selection);
    } catch {
      /* 次に開いたときに読み直す */
    }
  };

  const unlocks = unlockedKeys(me?.meter ?? 0);

  let body;
  if (error) {
    body = (
      <div className="center">
        <p>{error}</p>
        <button className="btn" onClick={load}>
          もう一度
        </button>
      </div>
    );
  } else if (!me) {
    body = (
      <div className="center">
        <p>よみこみ中…</p>
      </div>
    );
  } else if (!me.user) {
    body = <Register onDone={load} />;
  } else if (!showHome || !selection) {
    body = <Bubbles initial={me.answers} unlocks={unlocks} onChange={saveAnswers} onGo={select} onDone={() => setShowHome(true)} />;
  } else {
    body = (
      <Home
        me={me}
        selection={selection}
        notices={notices}
        startPage={1}
        historyKey={historyKey}
        onPlay={setPlaying}
      />
    );
  }

  return (
    <div className="app" ref={appRef} onScroll={(e) => e.currentTarget.scrollTop && e.currentTarget.scrollTo(0, 0)}>
      <Sky unlocks={unlocks} />
      {/* 視聴中・お知らせ表示中は、後ろの画面を操作できないようにする */}
      <div inert={!!playing || modal}>{body}</div>
      {playing && <Player target={playing} onClose={closePlayer} onMeter={(meter) => setMe((m) => (m ? { ...m, meter } : m))} />}
      {modal && notices.length > 0 && me?.user && <NoticeModal notices={notices} onClose={closeModal} />}
    </div>
  );
}
