import { normalCdf, inverseNormal } from "./normal";

export function probabilisticSharpeRatio(
  observedSharpe: number,
  observations: number,
  skewness: number,
  rawKurtosis: number,
  benchmarkSharpe = 0
): number {
  if (!Number.isFinite(observedSharpe) || observations < 2) return Number.NaN;
  const denominator = 1 - skewness * observedSharpe + ((rawKurtosis - 1) / 4) * observedSharpe ** 2;
  if (!Number.isFinite(denominator) || denominator <= 0) return observedSharpe > benchmarkSharpe ? 1 : 0;
  const statistic = (observedSharpe - benchmarkSharpe) * Math.sqrt(observations - 1) / Math.sqrt(denominator);
  return normalCdf(statistic);
}

export function minimumTrackRecordLength(
  observedSharpe: number,
  skewness: number,
  rawKurtosis: number,
  benchmarkSharpe = 0,
  alpha = 0.05
): number {
  if (!Number.isFinite(observedSharpe) || observedSharpe <= benchmarkSharpe) return Infinity;
  const denominator = 1 - skewness * observedSharpe + ((rawKurtosis - 1) / 4) * observedSharpe ** 2;
  const z = inverseNormal(1 - alpha);
  return denominator * (z / (observedSharpe - benchmarkSharpe)) ** 2;
}
