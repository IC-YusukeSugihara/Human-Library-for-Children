import { randomInt } from 'node:crypto';

// 招待コード：見まちがえやすい文字（0/O、1/I/L など）を使わない8文字。表示は「ABCD-EFGH」
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export function normalizeCode(input: unknown): string {
  return String(input ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export const formatCode = (code: string) => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);
