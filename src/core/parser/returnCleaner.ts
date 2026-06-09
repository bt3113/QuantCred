export function parseReturn(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasPercent = trimmed.endsWith("%");
  const numericText = trimmed.replace(/%$/, "").replace(/,/g, "");
  const number = Number(numericText);
  if (!Number.isFinite(number)) return null;
  return hasPercent ? number / 100 : number;
}

export function looksLikePercentReturns(values: number[]): boolean {
  const finite = values.filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
  if (!finite.length) return false;
  const median = finite[Math.floor(finite.length / 2)];
  return median > 0.25;
}

export function decimalizePercentSeries(values: number[]): number[] {
  return values.map((value) => (Number.isFinite(value) ? value / 100 : value));
}

export function filterPossibleReturns(values: number[]): number[] {
  return values.filter((value) => Number.isFinite(value) && value > -1);
}
