import { useEffect, useRef, useState } from 'react';
import { api, thumb } from '../api';

interface Video {
  id: string;
  url: string;
  title: string;
  summary: string;
  cat: string;
  is_infra: boolean;
  kind: string;
  channel: string;
  length: string;
  job: string;
  memo: string;
  review_status: 'pending' | 'approved' | 'rejected';
  available: boolean | null;
  checked_at: string | null;
}

interface CheckResult {
  checked: number;
  total: number;
  unavailable: { id: string; title: string; status: number }[];
  failed: { id: string; title: string }[];
}

const STS: [Video['review_status'], string][] = [
  ['pending', '未審査'],
  ['approved', '承認'],
  ['rejected', '拒否'],
];

// 5.3 動画審査（今の審査ページを移したもの）＋ 5.4 動画の確認ボタン
export function Videos() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState<Video['review_status']>('pending');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [newCat, setNewCat] = useState('');
  const [adding, setAdding] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const say = (t: string) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3500);
  };

  const load = () =>
    api
      .get<{ videos: Video[] }>('/api/admin/videos')
      .then((r) => setVideos(r.videos))
      .catch((e) => say(e.message));

  useEffect(() => {
    load();
  }, []);

  const decide = async (id: string, st: Video['review_status']) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await api.post(`/api/admin/videos/${id}/status`, { status: st });
      setVideos((vs) => vs?.map((v) => (v.id === id ? { ...v, review_status: st } : v)) ?? vs);
    } catch (e) {
      say(e instanceof Error ? e.message : '保存できませんでした。もう一度押してください');
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const runCheck = async () => {
    setChecking(true);
    setCheck(null);
    try {
      const r = await api.post<CheckResult>('/api/admin/videos/check');
      setCheck(r);
      await load();
    } catch (e) {
      say(e instanceof Error ? e.message : '確認できませんでした');
    } finally {
      setChecking(false);
    }
  };

  const add = async () => {
    setAdding(true);
    try {
      const r = await api.post<{ title: string | null; available: boolean | null }>('/api/admin/videos', { url: newUrl, cat: newCat });
      say(`未審査に追加しました：${r.title ?? '（タイトル未取得）'}${r.available === false ? '（今は見られない動画です）' : ''}`);
      setNewUrl('');
      setStatus('pending');
      await load();
    } catch (e) {
      say(e instanceof Error ? e.message : '追加できませんでした');
    } finally {
      setAdding(false);
    }
  };

  const all = videos ?? [];
  const n = { pending: 0, approved: 0, rejected: 0 };
  all.forEach((d) => n[d.review_status]++);
  const cats = [...new Set(all.map((d) => d.cat).filter(Boolean))];
  const catDocs = all.filter((d) => cat === 'all' || d.cat === cat);
  const cn = { pending: 0, approved: 0, rejected: 0 };
  catDocs.forEach((d) => cn[d.review_status]++);
  const list = catDocs.filter((d) => d.review_status === status);
  const gone = all.filter((d) => d.review_status === 'approved' && d.available === false);

  return (
    <div className="admBody">
      <div className="vr">
        <p className="sum">
          全{all.length}本　未審査 {n.pending}／承認 {n.approved}／拒否 {n.rejected}
          {gone.length > 0 && <span style={{ color: 'var(--ng)' }}>　見られない（選定から除外中） {gone.length}本</span>}
        </p>
        <div className="filters">
          <div className="seg" role="group" aria-label="ジャンル">
            <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
              すべて
            </button>
            {cats.map((c) => (
              <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="状態">
            {STS.map(([s, label]) => (
              <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
                {label}
                <span className="n">{cn[s]}</span>
              </button>
            ))}
          </div>
        </div>

        <details className="tools" open={!!check || checking}>
          <summary>動画の確認（承認済みの動画が今も見られるか）</summary>
          <div className="in">
            <p style={{ margin: '0 0 10px' }}>
              押すと、承認済みの全動画が YouTube で今も見られるかを確かめます。見られない動画は、子どもへの選定から外れます（YouTube の oEmbed が 200 以外を返したものを「見られない」とします）。
            </p>
            <button className="abtn ok" onClick={runCheck} disabled={checking}>
              {checking ? '確かめています…' : '動画の確認'}
            </button>
            {check && (
              <div className="checkResult">
                {check.checked} / {check.total} 本を確かめました。
                {check.unavailable.length === 0 ? (
                  <div>見られない動画はありませんでした。</div>
                ) : (
                  <>
                    <div style={{ color: 'var(--ng)', fontWeight: 700 }}>見られない動画（選定から外しました）：{check.unavailable.length}本</div>
                    <ul>
                      {check.unavailable.map((u) => (
                        <li key={u.id}>
                          {u.title}（{u.id}・応答 {u.status}）
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {check.failed.length > 0 && <div>通信できず確かめられなかった動画：{check.failed.map((f) => f.title).join('、')}</div>}
              </div>
            )}
            {!check && gone.length > 0 && (
              <div className="checkResult">
                <div style={{ color: 'var(--ng)', fontWeight: 700 }}>前回の確認で見られなかった動画（選定から除外中）</div>
                <ul>
                  {gone.map((g) => (
                    <li key={g.id}>
                      {g.title}（{g.id}）
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>

        <details className="tools">
          <summary>動画を追加する</summary>
          <div className="in">
            <form
              className="formRow"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <label>
                YouTube の URL
                <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
              </label>
              <label style={{ flex: '0 1 180px' }}>
                ジャンル
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} list="cats" placeholder="例：パン" />
                <datalist id="cats">
                  {cats.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <button className="abtn ok" disabled={adding || !newUrl.trim() || !newCat.trim()}>
                {adding ? '追加しています…' : '未審査に追加'}
              </button>
            </form>
            <p style={{ margin: '8px 0 0' }}>タイトルとチャンネル名は YouTube から自動で入ります。ジャンルが電気・水道・ごみ・ガス・道路のときはインフラとして扱います。</p>
          </div>
        </details>

        {videos === null ? (
          <p className="emptyA">読み込み中…</p>
        ) : !list.length ? (
          <p className="emptyA">この条件の動画はありません。</p>
        ) : (
          <div className="vgrid">
            {list.map((d) => (
              <article key={d.id} className="vcard">
                <div className="vthumb">
                  <img src={thumb(d.id)} alt="" loading="lazy" />
                  {d.available === false && <span className="gone">見られない</span>}
                </div>
                <div className="vbody">
                  <div className="vmeta">
                    <span className="vchip cat">{d.cat}</span>
                    {d.is_infra && <span className="vchip infra">インフラ</span>}
                    {d.kind && <span className="vchip">{d.kind}</span>}
                    {d.length && <span className="vchip">{d.length}</span>}
                    {d.channel && <span className="vchip">{d.channel}</span>}
                  </div>
                  <h2 className="vtitle">{d.title}</h2>
                  {d.summary && <p className="vsummary">{d.summary}</p>}
                  {d.job && <p className="vjob">映っている仕事：{d.job}</p>}
                  {d.memo && <p className="vmemo">{d.memo}</p>}
                  <div className="vactions">
                    <a className="yt" href={d.url} target="_blank" rel="noopener noreferrer">
                      YouTubeで見る ↗
                    </a>
                    {d.review_status === 'pending' ? (
                      <>
                        <button className="abtn" disabled={busy[d.id]} onClick={() => decide(d.id, 'rejected')}>
                          拒否
                        </button>
                        <button className="abtn ok" disabled={busy[d.id]} onClick={() => decide(d.id, 'approved')}>
                          承認
                        </button>
                      </>
                    ) : (
                      <>
                        <span className={`vbadge ${d.review_status}`}>{d.review_status === 'approved' ? '承認済み' : '拒否済み'}</span>
                        <button className="abtn" disabled={busy[d.id]} onClick={() => decide(d.id, 'pending')}>
                          未審査に戻す
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
