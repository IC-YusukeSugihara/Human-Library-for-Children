import { useEffect, useState } from 'react';
import { api } from '../api';

interface Invite {
  code: string;
  display: string;
  note: string;
  created_at: string;
  used_at: string | null;
  nickname: string | null;
}

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 5.5 招待コードの発行（1コード1人。使ったら使用済み）
export function Invites() {
  const [list, setList] = useState<Invite[] | null>(null);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<{ invites: Invite[] }>('/api/admin/invites')
      .then((r) => setList(r.invites))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ created: string[] }>('/api/admin/invites', { count, note });
      setCreated(r.created);
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '発行できませんでした');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admBody">
      <div className="narrow">
        <p className="lead">招待コードは1つにつき1人が使えます。使われると「使用済み」になり、登録したニックネームが表示されます。</p>
        <form
          className="formRow"
          onSubmit={(e) => {
            e.preventDefault();
            issue();
          }}
        >
          <label style={{ flex: '0 1 120px' }}>
            発行する数
            <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </label>
          <label>
            メモ（だれに渡すか など。任意）
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} />
          </label>
          <button className="okb" style={{ flex: '0 0 auto', padding: '0 22px' }} disabled={busy}>
            発行する
          </button>
        </form>
        {error && <p className="err">{error}</p>}
        {created.length > 0 && (
          <div className="newCodes">
            <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 6 }}>発行しました：</div>
            {created.map((c) => (
              <div key={c} className="code">
                {c}
              </div>
            ))}
          </div>
        )}

        <h3 className="sub">発行したコード</h3>
        {list === null ? (
          <p className="emptyA">読みこみ中…</p>
        ) : list.length === 0 ? (
          <p className="emptyA">まだ発行していません</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="itable">
              <thead>
                <tr>
                  <th>コード</th>
                  <th>状態</th>
                  <th>メモ</th>
                  <th>発行日時</th>
                </tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.code}>
                    <td className="code">{i.display}</td>
                    <td>{i.used_at ? <span className="res ok">使用済み（{i.nickname ?? '削除された利用者'}・{fmt(i.used_at)}）</span> : <span style={{ color: 'var(--sub)' }}>未使用</span>}</td>
                    <td style={{ color: 'var(--text2)' }}>{i.note}</td>
                    <td style={{ color: 'var(--sub)', whiteSpace: 'nowrap' }}>{fmt(i.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
