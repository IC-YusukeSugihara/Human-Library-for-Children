// YouTube まわり：動画IDの取り出しと、見られるかどうかの確認（5.4）

export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v');
    const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
    if (!id && m) id = m[2];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export interface OembedResult {
  status: number | null; // null は通信できなかった
  title?: string;
  author?: string;
}

export async function oembed(videoId: string): Promise<OembedResult> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (r.status !== 200) return { status: r.status };
    const j = (await r.json()) as { title?: string; author_name?: string };
    return { status: 200, title: j.title, author: j.author_name };
  } catch {
    return { status: null };
  }
}

// 並べて少しずつ確かめる（一度にたくさん送らない）
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
