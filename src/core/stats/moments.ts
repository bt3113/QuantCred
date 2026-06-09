export function finite(values: number[]): number[] {
  return values.filter(Number.isFinite);
}

export function mean(values: number[]): number {
  const xs = finite(values);
  if (!xs.length) return Number.NaN;
  return xs.reduce((sum, value) => sum + value, 0) / xs.length;
}

export function sampleVariance(values: number[]): number {
  const xs = finite(values);
  if (xs.length < 2) return Number.NaN;
  const avg = mean(xs);
  return xs.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (xs.length - 1);
}

export function sampleStd(values: number[]): number {
  return Math.sqrt(sampleVariance(values));
}

export function sampleSkewness(values: number[]): number {
  const xs = finite(values);
  if (xs.length < 3) return Number.NaN;
  const avg = mean(xs);
  const sd = sampleStd(xs);
  if (!Number.isFinite(sd) || sd === 0) return Number.NaN;
  const n = xs.length;
  const moment3 = xs.reduce((sum, value) => sum + ((value - avg) / sd) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * moment3;
}

export function rawKurtosis(values: number[]): number {
  const xs = finite(values);
  if (xs.length < 4) return Number.NaN;
  const avg = mean(xs);
  const sd = sampleStd(xs);
  if (!Number.isFinite(sd) || sd === 0) return Number.NaN;
  const n = xs.length;
  const moment4 = xs.reduce((sum, value) => sum + ((value - avg) / sd) ** 4, 0);
  const excess = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * moment4
    - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  return excess + 3;
}

export function median(values: number[]): number {
  const xs = finite(values).sort((a, b) => a - b);
  if (!xs.length) return Number.NaN;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function covariance(x: number[], y: number[]): number {
  const pairs = x.map((value, index) => [value, y[index]] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 2) return Number.NaN;
  const meanX = mean(pairs.map(([a]) => a));
  const meanY = mean(pairs.map(([, b]) => b));
  return pairs.reduce((sum, [a, b]) => sum + (a - meanX) * (b - meanY), 0) / (pairs.length - 1);
}

export function correlation(x: number[], y: number[]): number {
  const cov = covariance(x, y);
  const sx = sampleStd(x);
  const sy = sampleStd(y);
  return Number.isFinite(cov) && sx > 0 && sy > 0 ? cov / (sx * sy) : Number.NaN;
}
