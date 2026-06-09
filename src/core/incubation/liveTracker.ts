import type { IncubationResult, LockedStrategy } from "../types";
import { returnVolatilityRatio } from "../stats/ratio";
import { maximumEquityDecline } from "../stats/decline";
import { mean, sampleStd } from "../stats/moments";

export interface DatedReturn {
  date: string;
  value: number;
}

export function lockStrategy(args: {
  strategyId: string;
  reportHash: string;
  selectedConfigHash: string;
  backtestEndDate: string;
  lockDate?: string;
}): LockedStrategy {
  return {
    strategyId: args.strategyId,
    reportHash: args.reportHash,
    selectedConfigHash: args.selectedConfigHash,
    backtestEndDate: args.backtestEndDate,
    lockDate: args.lockDate ?? new Date().toISOString()
  };
}

export function evaluateLiveAppend(args: {
  locked: LockedStrategy;
  backtestReturns: number[];
  liveReturns: DatedReturn[];
  minimumObservations?: number;
}): IncubationResult {
  const live = args.liveReturns.map((row) => row.value).filter(Number.isFinite);
  const minimumObservations = args.minimumObservations ?? 30;
  const backtestSharpe = returnVolatilityRatio(args.backtestReturns);
  const liveSharpe = returnVolatilityRatio(live);
  const liveDrawdown = maximumEquityDecline(live);
  const liveHitRate = live.filter((value) => value > 0).length / Math.max(1, live.length);
  const zScore = liveVsResearchZScore(args.backtestReturns, live);
  const degradationRatio = Number.isFinite(backtestSharpe) && backtestSharpe !== 0 ? liveSharpe / backtestSharpe : Number.NaN;

  return {
    liveStart: args.liveReturns[0]?.date ?? "",
    liveEnd: args.liveReturns[args.liveReturns.length - 1]?.date ?? "",
    liveObservations: live.length,
    backtestSharpe,
    liveSharpe,
    liveDrawdown,
    liveHitRate,
    liveVsBacktestZScore: zScore,
    degradationRatio,
    consistencyStatus: live.length < minimumObservations
      ? "insufficient_data"
      : zScore < -2 || degradationRatio < 0.25
        ? "failed"
        : zScore < -1 || degradationRatio < 0.5
          ? "weak"
          : "consistent"
  };
}

function liveVsResearchZScore(backtestReturns: number[], liveReturns: number[]): number {
  const liveMean = mean(liveReturns);
  const researchMean = mean(backtestReturns);
  const researchStd = sampleStd(backtestReturns);
  if (!Number.isFinite(liveMean) || !Number.isFinite(researchMean) || !Number.isFinite(researchStd) || researchStd === 0) return Number.NaN;
  return (liveMean - researchMean) / (researchStd / Math.sqrt(Math.max(1, liveReturns.length)));
}
