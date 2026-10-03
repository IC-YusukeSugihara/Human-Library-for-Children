import type { ReactNode } from 'react';
import { UNLOCKS, type MeState, type Notice } from '../../shared/types';
import { NoticeList } from './Notices';

// 4.7 マイページ：感謝メーターと、解放された見た目の演出。承認待ちの結果のお知らせ
export function MyPage({ me, notices, footer }: { me: MeState; notices: Notice[]; footer: ReactNode }) {
  const next = UNLOCKS.find((u) => me.meter < u.at);
  const prevAt = [...UNLOCKS].reverse().find((u) => me.meter >= u.at)?.at ?? 0;
  const fill = next ? (me.meter - prevAt) / (next.at - prevAt) : 1;

  return (
    <div className="panelPage">
      <div style={{ padding: '20px 20px 12px' }}>
        <span className="logo">Human Library</span>
        <h2 style={{ marginTop: 10 }}>マイページ</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--sub)', fontSize: 13 }}>{me.user?.nickname} さん</p>
      </div>
      <div className="scroller">
        <div className="box">
          <div className="meter">
            <div className="jar" aria-hidden="true">
              <div className="fill" style={{ height: `${Math.round(fill * 100)}%` }} />
              <div className="num">{me.meter}</div>
            </div>
            <div className="label">
              <b>かんしゃメーター</b>
              <br />
              ありがとうの気持ちがとどくと、ひかりがたまるよ。
              <br />
              {next ? `つぎの演出まで、あと ${next.at - me.meter}` : 'ぜんぶの演出が ひらいたよ'}
            </div>
          </div>
          <ul className="unlocks">
            {UNLOCKS.map((u) => (
              <li key={u.key} className={me.meter >= u.at ? 'on' : ''}>
                <span className="mark">{me.meter >= u.at ? '✓' : u.at}</span>
                {u.name}
              </li>
            ))}
          </ul>
        </div>

        {notices.length > 0 && (
          <>
            <h3 className="secTitle">お知らせ</h3>
            <NoticeList notices={notices} />
          </>
        )}
      </div>
      {footer}
    </div>
  );
}
