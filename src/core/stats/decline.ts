export interface EquityDeclinePoint {
  index: number;
  equity: number;
  peak: number;
  decline: number;
}

export function equityPath(returns: number[], initialEquity = 1): number[] {
  const path: number[] = [];
  let equity = initialEquity;
  for (const value of returns) {
    if (!Number.isFinite(value)) continue;
    equity *= 1 + value;
    path.push(equity);
  }
  return path;
}

export function equityDeclineSeries(returns: number[]): EquityDeclinePoint[] {
  const path = equityPath(returns);
  let peak = path[0] ?? 1;
  return path.map((equity, index) => {
    peak = Math.max(peak, equity);
    return { index, equity, peak, decline: equity / peak - 1 };
  });
}

export function maximumEquityDecline(returns: number[]): number {
  const series = equityDeclineSeries(returns);
  return series.length ? Math.min(...series.map((point) => point.decline)) : Number.NaN;
}

export function longestDeclineDuration(returns: number[]): number {
  const series = equityDeclineSeries(returns);
  let current = 0;
  let longest = 0;
  for (const point of series) {
    if (point.decline < 0) current += 1;
    else current = 0;
    longest = Math.max(longest, current);
  }
  return longest;
}
