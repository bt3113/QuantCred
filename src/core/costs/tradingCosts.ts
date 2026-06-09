import type { CostConfig } from "../types";

export interface TradeCostInput {
  tradedNotional: number;
  spreadBps?: number;
  financingNotional?: number;
  periodsPerYear?: number;
  adv?: number;
}

export interface TradeCostBreakdown {
  commissionCost: number;
  spreadCost: number;
  slippageCost: number;
  financingCost: number;
  impactCost: number;
  totalCost: number;
}

export function estimateTradeCost(input: TradeCostInput, config: CostConfig): TradeCostBreakdown {
  const tradedNotional = Math.max(0, input.tradedNotional);
  const financingNotional = Math.max(0, input.financingNotional ?? 0);
  const spreadBps = Math.max(0, input.spreadBps ?? 0);
  const periodsPerYear = Math.max(1, input.periodsPerYear ?? 252);
  const adv = Math.max(0, input.adv ?? 0);

  const commissionCost = tradedNotional * config.commissionBps / 10000;
  const spreadCost = tradedNotional * spreadBps * config.spreadCaptureFraction / 10000;
  const slippageCost = tradedNotional * config.slippageBps / 10000;
  const financingCost = financingNotional * config.borrowCostAnnualBps / 10000 / periodsPerYear;
  const participation = adv > 0 ? tradedNotional / adv : 0;
  const impactCost = adv > 0
    ? tradedNotional * config.marketImpactCoefficient * Math.sqrt(Math.max(0, participation))
    : 0;

  return {
    commissionCost,
    spreadCost,
    slippageCost,
    financingCost,
    impactCost,
    totalCost: commissionCost + spreadCost + slippageCost + financingCost + impactCost
  };
}

export function costAdjustedReturn(grossReturn: number, capital: number, totalCost: number): number {
  if (!Number.isFinite(grossReturn) || capital <= 0) return Number.NaN;
  return grossReturn - totalCost / capital;
}
