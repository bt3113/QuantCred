import type { RegimeAudit } from "../types";
import { mean, sampleStd } from "../stats/moments";
import { returnVolatilityRatio } from "../stats/ratio";
import { maximumEquityDecline } from "../stats/decline";

export interface RegimeRow {
  date: string;
  regime: string;
}

export interface DatedReturn {
  date: string;
  value: number;
}

export function explicitRegimeAnalysis(returns: DatedReturn[], regimes: RegimeRow[]): RegimeAudit[] {
  const regimeByDate = new Map(regimes.map((row) => [row.date, row.regime]));
  const grouped = new Map<string, number[]>();

  for (const row of returns) {
    const regime = regimeByDate.get(row.date) ?? "unclassified";
    if (!grouped.has(regime)) grouped.set(regime, []);
    grouped.get(regime)?.push(row.value);
  }

  const totalReturn = compound(returns.map((row) => row.value));
  return [...grouped.entries()].map(([regime, values]) => summarizeRegime(regime, values, totalReturn));
}

export function inferredVolatilityRegimes(returns: DatedReturn[], windowSize = 21): RegimeAudit[] {
  const rows = returns.map((row, index) => {
    const window = returns.slice(Math.max(0, index - windowSize + 1), index + 1).map((item) => item.value);
    const volatility = sampleStd(window);
    return { ...row, volatility };
  });
  const sortedVol = rows.map((row) => row.volatility).filter(Number.isFinite).sort((a, b) => a - b);
  const threshold = sortedVol[Math.floor(sortedVol.length / 2)] ?? Number.NaN;
  const regimes = rows.map((row) => ({ date: row.date, regime: row.volatility > threshold ? "high_vol" : "low_vol" }));
  return explicitRegimeAnalysis(returns, regimes);
}

function summarizeRegime(regime: string, values: number[], totalReturn: number): RegimeAudit {
  const contribution = compound(values);
  return {
    regime,
    observations: values.length,
    meanReturn: mean(values),
    volatility: sampleStd(values),
    sharpe: returnVolatilityRatio(values),
    maxDrawdown: maximumEquityDecline(values),
    contributionToTotalReturn: totalReturn !== 0 ? contribution / totalReturn : Number.NaN
  };
}

function compound(values: number[]): number {
  return values.filter(Number.isFinite).reduce((equity, value) => equity * (1 + value), 1) - 1;
}
