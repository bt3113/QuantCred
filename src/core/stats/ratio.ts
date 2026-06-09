import { mean, sampleStd, sampleSkewness, rawKurtosis } from "./moments";

export interface RatioSummary {
  observations: number;
  meanValue: number;
  volatility: number;
  score: number;
  skewness: number;
  rawKurtosis: number;
}

export function returnVolatilityRatio(series: number[], baselinePerPeriod = 0): number {
  const adjusted = series.filter(Number.isFinite).map((value) => value - baselinePerPeriod);
  const volatility = sampleStd(adjusted);
  return Number.isFinite(volatility) && volatility > 0 ? mean(adjusted) / volatility : Number.NaN;
}

export function summarizeRatio(series: number[], baselinePerPeriod = 0): RatioSummary {
  const adjusted = series.filter(Number.isFinite).map((value) => value - baselinePerPeriod);
  return {
    observations: adjusted.length,
    meanValue: mean(adjusted),
    volatility: sampleStd(adjusted),
    score: returnVolatilityRatio(series, baselinePerPeriod),
    skewness: sampleSkewness(adjusted),
    rawKurtosis: rawKurtosis(adjusted)
  };
}

export function annualizeRatio(nativeRatio: number, periodsPerYear: number): number {
  return Number.isFinite(nativeRatio) && periodsPerYear > 0 ? nativeRatio * Math.sqrt(periodsPerYear) : Number.NaN;
}
