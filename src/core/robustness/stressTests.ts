import { returnVolatilityRatio } from "../stats/ratio";

export interface StressScenario {
  id: string;
  name: string;
  shockBps: number;
  volatilityMultiplier: number;
}

export interface StressResult {
  scenarioId: string;
  meanReturn: number;
  volatility: number;
  sharpe: number;
  cumulativeReturn: number;
}

export function runReturnStressTests(returns: number[], scenarios: StressScenario[]): StressResult[] {
  return scenarios.map((scenario) => {
    const stressed = returns
      .filter(Number.isFinite)
      .map((value) => value * scenario.volatilityMultiplier - scenario.shockBps / 10000);
    return {
      scenarioId: scenario.id,
      meanReturn: average(stressed),
      volatility: standardDeviation(stressed),
      sharpe: returnVolatilityRatio(stressed),
      cumulativeReturn: stressed.reduce((equity, value) => equity * (1 + value), 1) - 1
    };
  });
}

export const DEFAULT_STRESS_SCENARIOS: StressScenario[] = [
  { id: "minus_5bps", name: "Subtract 5 bps each period", shockBps: 5, volatilityMultiplier: 1 },
  { id: "minus_10bps", name: "Subtract 10 bps each period", shockBps: 10, volatilityMultiplier: 1 },
  { id: "vol_x_150", name: "Increase volatility by 50%", shockBps: 0, volatilityMultiplier: 1.5 },
  { id: "minus_5bps_vol_x_150", name: "Subtract 5 bps and increase volatility by 50%", shockBps: 5, volatilityMultiplier: 1.5 }
];

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return Number.NaN;
  const avg = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
}
