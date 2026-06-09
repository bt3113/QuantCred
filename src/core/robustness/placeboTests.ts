import { returnVolatilityRatio } from "../stats/ratio";

export interface PlaceboResult {
  observedScore: number;
  placeboScores: number[];
  empiricalPValue: number;
}

export function circularShiftPlacebo(returns: number[], shifts: number[]): PlaceboResult {
  const clean = returns.filter(Number.isFinite);
  const observedScore = returnVolatilityRatio(clean);
  const placeboScores = shifts
    .map((shift) => returnVolatilityRatio(circularShift(clean, shift)))
    .filter(Number.isFinite);
  const exceedances = placeboScores.filter((score) => score >= observedScore).length;
  return {
    observedScore,
    placeboScores,
    empiricalPValue: (exceedances + 1) / (placeboScores.length + 1)
  };
}

export function signFlipPlacebo(returns: number[], iterations: number, seed = 123456789): PlaceboResult {
  const clean = returns.filter(Number.isFinite);
  const rng = seededRandom(seed);
  const observedScore = returnVolatilityRatio(clean);
  const placeboScores: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    placeboScores.push(returnVolatilityRatio(clean.map((value) => (rng() < 0.5 ? value : -value))));
  }
  const exceedances = placeboScores.filter((score) => score >= observedScore).length;
  return {
    observedScore,
    placeboScores,
    empiricalPValue: (exceedances + 1) / (placeboScores.length + 1)
  };
}

function circularShift(values: number[], shift: number): number[] {
  const n = values.length;
  if (!n) return [];
  const k = ((shift % n) + n) % n;
  return [...values.slice(k), ...values.slice(0, k)];
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
