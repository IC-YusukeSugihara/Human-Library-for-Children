import type { Notice } from '../../shared/types';

// 承認待ちだったコメントの結果。承認しなかったときは問いかけを返す（「不合格」とは言わない）
export function NoticeList({ notices }: { notices: Notice[] }) {
  return (
    <>
      {notices.map((n) => (
        <div key={n.id} className="notice">
          {n.status === 'approved' ? (
            <>
              「{n.video_title}」へのコメントが、とどいたよ。
              {n.meter_counted && <b style={{ color: 'var(--gold)' }}> メーターが1たまったよ。</b>}
            </>
          ) : (
            <>
              「{n.video_title}」へのコメントについて、もうすこし考えてみよう。
              {n.question && <div className="ask">{n.question}</div>}
            </>
          )}
          <div className="orig">あなたのコメント：{n.text}</div>
        </div>
      ))}
    </>
  );
}

export function NoticeModal({ notices, onClose }: { notices: Notice[]; onClose: () => void }) {
  return (
    <>
      <div className="scrim" />
      <div className="modalCard" role="dialog" aria-modal="true" aria-label="お知らせ">
        <h2>お知らせがあるよ</h2>
        <NoticeList notices={notices} />
        <button className="btn" style={{ width: '100%', marginTop: 6 }} onClick={onClose}>
          わかった
        </button>
      </div>
    </>
  );
}
