import { useState } from 'react';
import { AGE_GROUPS, AGE_LABEL, type AgeGroup } from '../../shared/types';
import { api } from '../api';

// 4.1 初回登録：招待コード → ニックネーム → 年齢区分 → 同意
export function Register({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [age, setAge] = useState<AgeGroup | null>(null);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checkCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ ok: boolean; message?: string }>('/api/invite/check', { code });
      if (r.ok) setStep(1);
      else setError(r.message ?? 'このコードは使えません');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'うまくいきませんでした');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!age) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/register', { code, nickname, age_group: age, consent: agree });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'うまくいきませんでした');
      setBusy(false);
    }
  };

  const minor = age !== null && age !== 'university';
  const nickLen = [...nickname.trim()].length;

  return (
    <div className="reg">
      <div className="card2" key={step}>
        <h1>Human Library for Children</h1>
        <div className="steps" aria-label={`4つのうち ${step + 1} つめ`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i <= step ? 'dot on' : 'dot'} />
          ))}
        </div>

        {step === 0 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              checkCode();
            }}
          >
            <h2>招待コードを入れてね</h2>
            <label className="field">
              招待コード
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCD-EFGH" />
            </label>
            {error && <p className="err">{error}</p>}
            <button className="btn next" disabled={busy || !code.trim()}>
              つぎへ
            </button>
          </form>
        )}

        {step === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (nickLen >= 1 && nickLen <= 20) setStep(2);
            }}
          >
            <h2>ニックネームを決めてね</h2>
            <label className="field">
              ニックネーム（20文字まで）
              <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} autoComplete="off" maxLength={20} />
            </label>
            <p className="help">本名は入れないでね。アプリの中で呼ぶときだけに使います。</p>
            <button className="btn next" disabled={nickLen < 1 || nickLen > 20}>
              つぎへ
            </button>
          </form>
        )}

        {step === 2 && (
          <div>
            <h2>あてはまるものをえらんでね</h2>
            <div className="ages">
              {AGE_GROUPS.map((g) => (
                <button
                  key={g}
                  className={age === g ? 'opt on' : 'opt'}
                  aria-pressed={age === g}
                  onClick={() => {
                    setAge(g);
                    setAgree(false);
                  }}
                >
                  {AGE_LABEL[g]}
                </button>
              ))}
            </div>
            <button className="btn next" disabled={!age} onClick={() => setStep(3)}>
              つぎへ
            </button>
          </div>
        )}

        {step === 3 && age && (
          <div>
            <h2>はじめる前に</h2>
            {minor && <p className="guardian">保護者に見てもらってね</p>}
            <div className="consent" style={{ marginTop: 12 }}>
              <ul>
                <li>このアプリは、使い方をためしている途中の「試作」です。</li>
                <li>
                  答えた内容と、書いたコメントは、AI（Anthropic社の Claude）に送って、動画えらびとコメントの確認に使います。ニックネームは送りません。
                </li>
                <li>コメントには、本名や住所、学校名、電話番号などを書かないでください。</li>
                <li>とどいたコメントは、名前を出さずに、同じ動画を見たほかの人にも表示されることがあります。</li>
                <li>答えとコメントは、アプリをよくするために、運営する大人が読むことがあります。</li>
                <li>動画は YouTube で再生します。</li>
              </ul>
            </div>
            <label className="check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>{minor ? '保護者です。内容を読んで、同意します。' : '内容を読んで、同意します。'}</span>
            </label>
            {error && <p className="err">{error}</p>}
            <button className="btn next" disabled={!agree || busy} onClick={submit}>
              はじめる
            </button>
          </div>
        )}

        {step > 0 && (
          <button className="skip" onClick={() => setStep(step - 1)} disabled={busy}>
            もどる
          </button>
        )}
      </div>
    </div>
  );
}
