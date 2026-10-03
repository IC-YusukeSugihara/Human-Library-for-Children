// 「その日」の区切り。夜、寝る前に使うので、日本時間の朝4時で日付を切り替える。
// （0時を過ぎてから開いても、同じ夜の続きとして扱うため）
const DAY_SHIFT_MS = (9 - 4) * 60 * 60 * 1000;

export function dayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + DAY_SHIFT_MS).toISOString().slice(0, 10);
}
