import { inverseNormal } from "./normal";
import { probabilisticSharpeRatio } from "./psr";
import { sampleVariance } from "./moments";

export interface DsrInput {
  selectedSharpe: number;
  observations: number;
  skewness: number;
  rawKurtosis: number;
  trialSharpes: number[];
}

export interface DsrResult {
  effectiveTrials: number;
  sharpeHurdle: number;
  probability: number;
}

export function deflatedSharpeRatio(input: DsrInput): DsrResult {
  const trialSharpes = input.trialSharpes.filter(Number.isFinite);
  const effectiveTrials = Math.max(1, trialSharpes.length);
  if (effectiveTrials <= 1) {
    return {
      effectiveTrials,
      sharpeHurdle: 0,
      probability: probabilisticSharpeRatio(input.selectedSharpe, input.observations, input.skewness, input.rawKurtosis, 0)
    };
  }

  const eulerGamma = 0.5772156649015329;
  const trialStd = Math.sqrt(Math.max(sampleVariance(trialSharpes), 0));
  const sharpeHurdle = trialStd * (
    (1 - eulerGamma) * inverseNormal(1 - 1 / effectiveTrials)
    + eulerGamma * inverseNormal(1 - 1 / (Math.E * effectiveTrials))
  );

  return {
    effectiveTrials,
    sharpeHurdle,
    probability: probabilisticSharpeRatio(input.selectedSharpe, input.observations, input.skewness, input.rawKurtosis, sharpeHurdle)
  };
}
