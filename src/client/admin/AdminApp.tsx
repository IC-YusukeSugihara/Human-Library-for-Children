import { useCallback, useEffect, useState } from 'react';
import '../styles/admin.css';
import { api } from '../api';
import { Review } from './Review';
import { PlanetMapView } from './PlanetMap';
import { Videos } from './Videos';
import { Invites } from './Invites';

type Tab = 'review' | 'map' | 'videos' | 'invites';
const TABS: [Tab, string][] = [
  ['review', '承認待ち'],
  ['map', 'テーマのつながり'],
  ['videos', '動画審査'],
  ['invites', '招待コード'],
];

export function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>(() => (TABS.find(([t]) => location.hash === `#${t}`)?.[0] ?? 'review'));
  const [pending, setPending] = useState(0);

  useEffect(() => {
    api
      .get<{ admin: boolean }>('/api/admin/me')
      .then((r) => setAuthed(r.admin))
      .catch(() => setAuthed(false));
  }, []);

  const refreshCount = useCallback(() => {
    api
      .get<{ pending: unknown[] }>('/api/admin/pending')
      .then((r) => setPending(r.pending.length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (authed) refreshCount();
  }, [authed, refreshCount]);

  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
  };

  if (authed === null) return <div className="adm" />;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  return (
    <div className="adm">
      <header className="admHead">
        <span className="title">Human Library for Children 管理</span>
        <nav className="tabs">
          {TABS.map(([t, label]) => (
            <button key={t} className={tab === t ? 'tab on' : 'tab'} onClick={() => go(t)}>
              {label}
              {t === 'review' && pending > 0 && <span className="badge">{pending}</span>}
            </button>
          ))}
        </nav>
        <button
          className="logout"
          onClick={async () => {
            await api.post('/api/admin/logout');
            setAuthed(false);
          }}
        >
          ログアウト
        </button>
      </header>
      {tab === 'review' && <Review onCount={setPending} />}
      {tab === 'map' && <PlanetMapView />}
      {tab === 'videos' && <Videos />}
      {tab === 'invites' && <Invites />}
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="adm" style={{ padding: 16 }}>
      <form
        className="login"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.post('/api/admin/login', { password: pw });
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'ログインできませんでした');
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>管理画面</h1>
        <label className="sr-only" htmlFor="pw">
          パスワード
        </label>
        <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="パスワード" autoComplete="current-password" />
        {error && <p className="err">{error}</p>}
        <button className="okb" style={{ width: '100%', marginTop: 14 }} disabled={busy || !pw}>
          ログイン
        </button>
      </form>
    </div>
  );
}
