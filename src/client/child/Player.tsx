import { useEffect, useRef, useState } from 'react';
import type { CommentResult } from '../../shared/types';
import { api } from '../api';
import { loadYouTube, type YTPlayer } from './youtube';

export interface PlayTarget {
  video_id: string;
  title: string;
  summary: string;
  label: string | null;
}

const MAX = 400;

// 4.4 視聴：アプリ内で YouTube を再生する。プレーヤーの上には文字や図形を重ねない。
// 4.5 感謝コメント → 4.6 みんなのコメント → 1本目なら「今日はここまで」
export function Player({ target, onClose, onMeter }: { target: PlayTarget; onClose: () => void; onMeter: (meter: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [firstOfDay, setFirstOfDay] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<CommentResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [others, setOthers] = useState<string[] | null>(null);
  const commentRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const recorded = useRef(false);

  useEffect(() => {
    let player: YTPlayer | null = null;
    let alive = true;
    const el = document.createElement('div');
    box.current?.appendChild(el);
    // YouTube の状態（1＝再生中、0＝終了）を受け取る
    const onState = (state: number) => {
      if (state === 1 && !recorded.current) {
        recorded.current = true;
        setStarted(true);
        api
          .post<{ is_first_of_day: boolean }>('/api/views', { video_id: target.video_id })
          .then((r) => setFirstOfDay(r.is_first_of_day))
          .catch(() => {
            recorded.current = false;
          });
      }
      if (state === 0) {
        setEnded(true);
        setWriting(true);
      }
    };
    // 手元での動作確認用：localhost のときだけ、外から再生状態を渡せるようにする
    if (location.hostname === 'localhost') (window as unknown as { __kanshaPlayerState?: (s: number) => void }).__kanshaPlayerState = onState;
    loadYouTube()
      .then((YT) => {
        if (!alive) return;
        player = new YT.Player(el, {
          videoId: target.video_id,
          host: 'https://www.youtube-nocookie.com',
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
          events: {
            onStateChange: (e) => onState(e.data),
            onError: () => setPlayError('この動画は、今は見られないみたい。一覧にもどって、ほかの動画をえらんでね。'),
          },
        });
      })
      .catch((e) => setPlayError(e.message));
    return () => {
      alive = false;
      player?.destroy();
      el.remove();
    };
  }, [target.video_id]);

  useEffect(() => {
    // プレーヤーの中だけをスクロールする（scrollIntoView は後ろの画面まで動かしてしまうため使わない）
    const box = scroller.current;
    const el = commentRef.current;
    if (writing && box && el) box.scrollTo({ top: Math.max(0, el.offsetTop - 80), behavior: 'smooth' });
  }, [writing]);

  const send = async () => {
    if (sending || !text.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const r = await api.post<CommentResult>('/api/comments', { video_id: target.video_id, text });
      setResult(r);
      onMeter(r.meter);
      if (r.verdict !== 'ng') setText('');
      api
        .get<{ comments: string[] }>(`/api/videos/${encodeURIComponent(target.video_id)}/comments`)
        .then((x) => setOthers(x.comments))
        .catch(() => setOthers([]));
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'おくれませんでした');
    } finally {
      setSending(false);
    }
  };

  const canWrite = started || ended;
  const showForm = writing && (!result || result.verdict === 'ng');
  const finished = result && result.verdict !== 'ng';

  return (
    <div className="player" ref={scroller} role="dialog" aria-modal="true" aria-label={target.title}>
      <div className="inner">
        <div className="pbar">
          <button className="back" onClick={onClose}>
            ← 一覧にもどる
          </button>
          {target.label && <span className="chip">{target.label}</span>}
        </div>

        <div className="screen" ref={box} />

        <div className="pbody">
          <h2>{target.title}</h2>
          {target.summary && <p className="desc">{target.summary}</p>}
          {playError && <p className="pnote" style={{ color: 'var(--ng)' }}>{playError}</p>}

          {!writing && !playError && (
            <>
              <p className="pnote">見おわったら、はたらく人に「ありがとう」や「おうえん」の気持ちを書いてみよう。</p>
              <button className="btn ghost" style={{ marginTop: 10 }} disabled={!canWrite} onClick={() => setWriting(true)}>
                コメントを書く
              </button>
            </>
          )}

          <div ref={commentRef}>
            {result?.verdict === 'ng' && result.question && (
              <div className="result ng" role="status">
                {result.question}
              </div>
            )}
            {showForm && (
              <div className="commentBox">
                <h3>{result?.verdict === 'ng' ? 'もう一度書いてみよう' : 'はたらく人へ、ひとこと'}</h3>
                <p className="sub">動画を見て思ったことを書いてね。名前や住所は書かないでね。</p>
                <textarea
                  value={text}
                  maxLength={MAX}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="例：朝早くから作ってくれていたんだね"
                  aria-label="コメント"
                />
                <div className="actions">
                  <span className="count">
                    {[...text].length} / {MAX}
                  </span>
                  <button className="btn" disabled={sending || !text.trim()} onClick={send}>
                    {sending ? 'とどけています…' : 'おくる'}
                  </button>
                </div>
                {sendError && <p className="pnote" style={{ color: 'var(--ng)' }}>{sendError}</p>}
              </div>
            )}

            {result?.verdict === 'ok' && (
              <div className="result ok" role="status">
                {result.meterUp && <span className="spark" aria-hidden="true" />}
                ありがとうが とどいたよ
                {result.meterUp && (
                  <>
                    <br />
                    メーターがたまったよ
                  </>
                )}
              </div>
            )}
            {result?.verdict === 'gray' && (
              <div className="result gray" role="status">
                受け取ったよ
              </div>
            )}

            {result && others && others.length > 0 && (
              <div className="others">
                <h3>みんなのコメント</h3>
                <ul>
                  {others.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {finished && (
              <div className="endCard">
                {firstOfDay ? (
                  <>
                    <h3>今日はここまで</h3>
                    <p>
                      見てくれて、書いてくれて、ありがとう。
                      <br />
                      ゆっくり休んでね。おやすみなさい。
                    </p>
                  </>
                ) : (
                  <p>見てくれて、ありがとう。</p>
                )}
                <button className="btn" onClick={onClose}>
                  一覧にもどる
                </button>
                {firstOfDay && <small>見たいときは、一覧からもう1本見てもだいじょうぶ。</small>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
