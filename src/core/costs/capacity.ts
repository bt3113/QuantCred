import type { CapacityPoint, CostConfig } from "../types";
import { estimateTradeCost } from "./tradingCosts";
import { returnVolatilityRatio } from "../stats/ratio";

export interface CapacityInput {
  grossReturns: number[];
  turnover: number[];
  averageAdv: number;
  capitalGrid?: number[];
  periodsPerYear?: number;
  costConfig: CostConfig;
}

export interface CapacitySummary {
  points: CapacityPoint[];
  capacitySharpeAbove1: number | null;
  capacitySharpeAbovePoint5: number | null;
  capacityBeforeAdvBreach: number | null;
  capacityBeforeNetAlphaNegative: number | null;
}

export const DEFAULT_CAPITAL_GRID = [100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000, 50000000, 100000000];

export function computeCapacityCurve(input: CapacityInput): CapacitySummary {
  const capitalGrid = input.capitalGrid ?? DEFAULT_CAPITAL_GRID;
  const periodsPerYear = input.periodsPerYear ?? 252;
  const points = capitalGrid.map((capital) => {
    const netReturns = input.grossReturns.map((grossReturn, index) => {
      const tradedNotional = capital * Math.max(0, input.turnover[index] ?? 0);
      const cost = estimateTradeCost({ tradedNotional, adv: input.averageAdv, periodsPerYear }, input.costConfig).totalCost;
      return grossReturn - cost / capital;
    });
    const maxAdvParticipation = input.averageAdv > 0 ? Math.max(...input.turnover.map((turnover) => capital * turnover / input.averageAdv)) : 0;
    const grossReturn = compound(input.grossReturns);
    const netReturn = compound(netReturns);
    return {
      capital,
      grossReturn,
      estimatedCost: Math.max(0, grossReturn - netReturn) * capital,
      netReturn,
      netSharpe: returnVolatilityRatio(netReturns),
      maxAdvParticipation
    };
  });

  return {
    points,
    capacitySharpeAbove1: lastCapital(points, (point) => point.netSharpe > 1),
    capacitySharpeAbovePoint5: lastCapital(points, (point) => point.netSharpe > 0.5),
    capacityBeforeAdvBreach: lastCapital(points, (point) => point.maxAdvParticipation <= input.costConfig.maxAdvParticipation),
    capacityBeforeNetAlphaNegative: lastCapital(points, (point) => point.netReturn > 0)
  };
}

function compound(returns: number[]): number {
  return returns.filter(Number.isFinite).reduce((equity, value) => equity * (1 + value), 1) - 1;
}

function lastCapital(points: CapacityPoint[], predicate: (point: CapacityPoint) => boolean): number | null {
  const passing = points.filter(predicate);
  return passing.length ? passing[passing.length - 1].capital : null;
}
