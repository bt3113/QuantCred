import type { AuditManifest, TrialCountMode, TrialLedgerEntry } from "../types";

export interface TrialCountDecision {
  mode: TrialCountMode;
  effectiveTrials: number;
  warning?: string;
}

export function createTrialFromMatrixColumn(strategyName: string, accepted = false): TrialLedgerEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    strategyName,
    hypothesis: "Imported from strategy matrix column",
    parameterSet: {},
    universe: "unknown",
    rebalanceRule: "unknown",
    costModel: "unknown",
    accepted
  };
}

export function importTrialLedgerFromCsvRows(rows: Array<Record<string, unknown>>): TrialLedgerEntry[] {
  return rows.map((row) => ({
    id: String(row.id || crypto.randomUUID()),
    timestamp: String(row.timestamp || new Date().toISOString()),
    strategyName: String(row.strategyName || row.strategy || row.name || "unknown"),
    hypothesis: String(row.hypothesis || ""),
    parameterSet: parseParameterSet(row.parameterSet),
    universe: String(row.universe || "unknown"),
    rebalanceRule: String(row.rebalanceRule || row.rebalance_rule || "unknown"),
    costModel: String(row.costModel || row.cost_model || "unknown"),
    resultSharpe: toOptionalNumber(row.resultSharpe || row.sharpe),
    resultMaxDrawdown: toOptionalNumber(row.resultMaxDrawdown || row.maxDrawdown),
    accepted: String(row.accepted).toLowerCase() === "true",
    rejectionReason: row.rejectionReason ? String(row.rejectionReason) : undefined
  }));
}

export function decideEffectiveTrials(args: {
  matrixColumns?: string[];
  manifest?: AuditManifest;
  ledger?: TrialLedgerEntry[];
  conservativeEstimate?: number;
}): TrialCountDecision {
  if (args.matrixColumns?.length) {
    return { mode: "strategy_matrix_columns", effectiveTrials: args.matrixColumns.length };
  }

  if (args.manifest?.declared_trials && args.manifest.declared_trials > 0) {
    return { mode: "declared_manual_trials", effectiveTrials: args.manifest.declared_trials };
  }

  const gridTrials = countParameterGridTrials(args.manifest?.parameter_grid);
  if (gridTrials > 0) {
    return { mode: "manifest_parameter_grid", effectiveTrials: gridTrials };
  }

  if (args.ledger?.length) {
    return { mode: "declared_manual_trials", effectiveTrials: args.ledger.length };
  }

  if (args.conservativeEstimate && args.conservativeEstimate > 1) {
    return {
      mode: "conservative_estimate",
      effectiveTrials: args.conservativeEstimate,
      warning: "Effective trial count is a conservative estimate because failed trials were not supplied."
    };
  }

  return {
    mode: "single_backtest",
    effectiveTrials: 1,
    warning: "DSR is unreliable if failed trials are not supplied or declared."
  };
}

export function countParameterGridTrials(grid?: Record<string, Array<string | number | boolean>>): number {
  if (!grid) return 0;
  const dimensions = Object.values(grid).filter((values) => Array.isArray(values) && values.length > 0);
  return dimensions.length ? dimensions.reduce((product, values) => product * values.length, 1) : 0;
}

function parseParameterSet(value: unknown): Record<string, string | number | boolean> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, string | number | boolean>;
  try {
    const parsed = JSON.parse(String(value));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toOptionalNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
