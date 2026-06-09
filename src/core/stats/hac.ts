export function neweyWestLongRunVariance(series: number[], lag: number): number {
  const values = series.filter(Number.isFinite);
  if (!values.length) return Number.NaN;
  const centered = center(values);
  const n = centered.length;
  let variance = autocovariance(centered, 0);
  for (let k = 1; k <= lag; k += 1) {
    const weight = 1 - k / (lag + 1);
    variance += 2 * weight * autocovariance(centered, k);
  }
  return variance;
}

export function neweyWestStandardError(series: number[], lag: number): number {
  const values = series.filter(Number.isFinite);
  if (!values.length) return Number.NaN;
  return Math.sqrt(Math.max(0, neweyWestLongRunVariance(values, lag) / values.length));
}

export function automaticLagLength(observations: number): number {
  return Math.max(0, Math.floor(4 * Math.pow(observations / 100, 2 / 9)));
}

function center(values: number[]): number[] {
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => value - avg);
}

function autocovariance(values: number[], lag: number): number {
  let sum = 0;
  for (let t = lag; t < values.length; t += 1) sum += values[t] * values[t - lag];
  return sum / values.length;
}
