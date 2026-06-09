import type { CapitalReadinessDecision, CapitalReadinessScore, DataIntegrityCheck } from "../types";

export interface ScoreInputs {
  psr?: number | null;
  dsr?: number | null;
  pbo?: number | null;
  robustnessScore?: number | null;
  postCostSharpe?: number | null;
  residualSharpe?: number | null;
  dataIntegrity?: DataIntegrityCheck[];
  hasLiveIncubation?: boolean;
  liveConsistencyScore?: number | null;
}

export function computeCapitalReadinessScore(input: ScoreInputs): CapitalReadinessScore {
  const dataIntegrityScore = scoreIntegrity(input.dataIntegrity ?? []);
  const components = {
    statisticalCredibility: percent(input.psr),
    multipleTestingControl: percent(input.dsr),
    robustness: input.pbo == null ? percent01(input.robustnessScore) : percent(1 - input.pbo),
    costCapacity: input.postCostSharpe == null ? 0 : Math.max(0, Math.min(100, input.postCostSharpe * 50)),
    factorIndependence: input.residualSharpe == null ? 0 : Math.max(0, Math.min(100, input.residualSharpe * 50)),
    dataIntegrity: dataIntegrityScore,
    liveIncubation: input.hasLiveIncubation ? percent01(input.liveConsistencyScore) : 0
  };

  const total =
    components.statisticalCredibility * 0.2 +
    components.multipleTestingControl * 0.2 +
    components.robustness * 0.15 +
    components.costCapacity * 0.15 +
    components.factorIndependence * 0.1 +
    components.dataIntegrity * 0.1 +
    components.liveIncubation * 0.1;

  const overrides: string[] = [];
  if (input.pbo != null && input.pbo > 0.5) overrides.push("PBO above 0.5 caps the decision at research_more.");
  if (input.dsr != null && input.dsr < 0.95) overrides.push("DSR below threshold caps the decision at research_more.");
  if ((input.dataIntegrity ?? []).some((check) => check.severity === "critical" && check.status !== "pass")) {
    overrides.push("Critical data-integrity risk caps the decision at research_more.");
  }
  if (input.postCostSharpe != null && input.postCostSharpe <= 0) overrides.push("Post-cost Sharpe is non-positive, so the decision is reject.");
  if (!input.hasLiveIncubation) overrides.push("No live incubation supplied, so the decision cannot exceed incubate.");

  return {
    total,
    components,
    decision: applyOverrides(totalToDecision(total), overrides, input.postCostSharpe),
    overrides
  };
}

function totalToDecision(total: number): CapitalReadinessDecision {
  if (total >= 90) return "candidate_for_allocation";
  if (total >= 75) return "small_capital_pilot";
  if (total >= 55) return "incubate";
  if (total >= 35) return "research_more";
  return "reject";
}

function applyOverrides(decision: CapitalReadinessDecision, overrides: string[], postCostSharpe?: number | null): CapitalReadinessDecision {
  if (postCostSharpe != null && postCostSharpe <= 0) return "reject";
  if (!overrides.length) return decision;
  const cap = overrides.some((item) => item.includes("No live incubation")) ? "incubate" : "research_more";
  return rank(decision) > rank(cap) ? cap : decision;
}

function rank(decision: CapitalReadinessDecision): number {
  return ["reject", "research_more", "incubate", "small_capital_pilot", "candidate_for_allocation"].indexOf(decision);
}

function percent(value?: number | null): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value * 100));
}

function percent01(value?: number | null): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function scoreIntegrity(checks: DataIntegrityCheck[]): number {
  if (!checks.length) return 0;
  const weights = { info: 1, warning: 2, critical: 4 } as const;
  const total = checks.reduce((sum, check) => sum + weights[check.severity], 0);
  const passed = checks.reduce((sum, check) => sum + (check.status === "pass" ? weights[check.severity] : 0), 0);
  return (passed / total) * 100;
}
