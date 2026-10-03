import { useEffect, useState } from 'react';
import { api } from '../api';

interface Pending {
  id: string;
  age: string;
  created_at: string;
  video_title: string;
  text: string;
  rule: string;
  reason: string;
  question: string | null;
  ai_failed: boolean;
}
interface Decided {
  id: string;
  text: string;
  status: 'approved' | 'rejected';
}

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 5.1 承認待ち（AIが迷ったコメント）
export function Review({ onCount }: { onCount: (n: number) => void }) {
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [decided, setDecided] = useState<Decided[]>([]);
  const [asks, setAsks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .get<{ pending: Pending[]; decided: Decided[] }>('/api/admin/pending')
      .then((r) => {
        setPending(r.pending);
        setDecided(r.decided);
        onCount(r.pending.length);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const decide = async (p: Pending, approve: boolean) => {
    setBusy((b) => ({ ...b, [p.id]: true }));
    try {
      await api.post(`/api/admin/comments/${p.id}/decide`, { approve, question: asks[p.id] ?? p.question ?? '' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした');
    } finally {
      setBusy((b) => ({ ...b, [p.id]: false }));
    }
  };

  return (
    <div className="admBody">
      <div className="narrow">
        <p className="lead">
          AIが判定に迷ったコメントです。子どもには「受け取ったよ」とだけ表示されています。承認するとその子のメーターが増え（その日1本目の動画へのコメントのとき）、承認しないときは下の問いかけが、その子が次に開いたときに表示されます。
        </p>
        {error && <p className="err">{error}</p>}
        {pending === null && <p className="emptyA">読みこみ中…</p>}
        {pending?.length === 0 && <p className="emptyA">承認待ちはありません</p>}
        {pending?.map((p) => (
          <div key={p.id} className="rcard">
            <div className="rmeta">
              <span className="chip2">{p.age}</span>
              <span>{when(p.created_at)}</span>
              <span>「{p.video_title}」へのコメント</span>
            </div>
            <p className="rtext">{p.text}</p>
            <p className="rnote">
              基準：{p.rule}
              <br />
              AIの見立て：{p.reason}
            </p>
            <label className="rnote" style={{ display: 'block' }}>
              承認しないときに返す問いかけ（書きかえられます）
              <textarea className="rask" value={asks[p.id] ?? p.question ?? ''} onChange={(e) => setAsks((a) => ({ ...a, [p.id]: e.target.value }))} />
            </label>
            <div className="ract">
              <button className="okb" disabled={busy[p.id]} onClick={() => decide(p, true)}>
                承認する
              </button>
              <button className="ngb" disabled={busy[p.id]} onClick={() => decide(p, false)}>
                承認しない
              </button>
            </div>
          </div>
        ))}
        {decided.length > 0 && (
          <>
            <h3 className="sub">処理したもの</h3>
            {decided.map((d) => (
              <div key={d.id} className="drow">
                <span>{d.text}</span>
                <span className={d.status === 'approved' ? 'res ok' : 'res ng'}>{d.status === 'approved' ? '承認した' : '承認しない（問いかけを返す）'}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
