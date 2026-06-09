import type { FactorAttribution } from "../types";
import { returnVolatilityRatio } from "../stats/ratio";
import { correlation, sampleStd } from "../stats/moments";
import { ols } from "./regression";

export interface FactorModelInput {
  strategyReturns: number[];
  factorReturns: Record<string, number[]>;
  periodsPerYear?: number;
}

export function factorAttribution(input: FactorModelInput): FactorAttribution {
  const factorNames = Object.keys(input.factorReturns);
  if (!factorNames.length) throw new Error("Factor attribution requires at least one factor return series.");

  const length = Math.min(input.strategyReturns.length, ...factorNames.map((name) => input.factorReturns[name].length));
  const y = input.strategyReturns.slice(0, length);
  const x = Array.from({ length }, (_, index) => factorNames.map((name) => input.factorReturns[name][index]));
  const fit = ols(y, x);
  const periodsPerYear = input.periodsPerYear ?? 252;
  const beta: Record<string, number> = {};
  const betaTStats: Record<string, number> = {};

  factorNames.forEach((name, index) => {
    beta[name] = fit.coefficients[index];
    betaTStats[name] = fit.tStats[index + 1];
  });

  const rawSharpe = returnVolatilityRatio(y);
  const residualSharpe = returnVolatilityRatio(fit.residuals);
  const rawVol = sampleStd(y);
  const residualVol = sampleStd(fit.residuals);

  return {
    alphaAnnualized: fit.intercept * periodsPerYear,
    alphaTStat: fit.tStats[0],
    beta,
    betaTStats,
    rSquared: fit.rSquared,
    residualSharpe,
    rawSharpe,
    explainedVolatilityFraction: rawVol > 0 ? Math.max(0, Math.min(1, 1 - residualVol / rawVol)) : Number.NaN
  };
}

export function factorCorrelations(strategyReturns: number[], factorReturns: Record<string, number[]>): Record<string, number> {
  return Object.fromEntries(Object.entries(factorReturns).map(([name, values]) => [name, correlation(strategyReturns, values)]));
}
