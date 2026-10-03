import { useEffect, useState, type ReactNode } from 'react';
import type { CommentStatus, HistoryItem } from '../../shared/types';
import { api, thumb } from '../api';

const STATUS: Record<CommentStatus, { text: string; cls: string }> = {
  ok: { text: 'とどいたよ', cls: 'st good' },
  approved: { text: 'とどいたよ', cls: 'st good' },
  pending: { text: '受け取ったよ', cls: 'st wait' },
  ng: { text: 'もうすこし考えてみよう', cls: 'st think' },
  rejected: { text: 'もうすこし考えてみよう', cls: 'st think' },
};

const fmtDay = (d: string) => {
  const [, m, day] = d.split('-');
  return `${Number(m)}月${Number(day)}日`;
};

// 4.8 履歴：見た動画と、自分が書いたコメントの一覧
export function History({
  header,
  refreshKey,
  onPlay,
}: {
  header: ReactNode;
  refreshKey: number;
  onPlay: (v: { video_id: string; title: string; summary: string; label: string | null }) => void;
}) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ items: HistoryItem[] }>('/api/history')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message));
  }, [refreshKey]);

  return (
    <div className="panelPage">
      {header}
      <div style={{ padding: '0 20px 10px' }}>
        <h2>履歴</h2>
      </div>
      <div className="scroller">
        {error && <p className="empty">{error}</p>}
        {!error && items === null && <p className="empty">読みこみ中…</p>}
        {items?.length === 0 && <p className="empty">まだ見た動画はありません。</p>}
        {items?.map((it) => (
          <div key={it.video_id} className="hItem">
            <button className="hThumb" onClick={() => onPlay({ video_id: it.video_id, title: it.title, summary: '', label: it.label })} aria-label={`${it.title} をもう一度見る`}>
              <img src={thumb(it.video_id)} alt="" loading="lazy" />
            </button>
            <div>
              <p className="ht">{it.title}</p>
              <p className="hm">
                {fmtDay(it.day)}
                {it.label ? `・${it.label}` : ''}
              </p>
            </div>
            {it.comments.map((c, i) => (
              <div key={i} className="hComment">
                {c.text}
                <span className={STATUS[c.status].cls}>{STATUS[c.status].text}</span>
                {c.question && <span style={{ display: 'block', color: 'var(--text2)', fontSize: 12 }}>{c.question}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
