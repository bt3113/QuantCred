import type { AuditManifest, DataIntegrityCheck } from "../types";
import { countParameterGridTrials } from "./trialLedger";

export interface ManifestValidationResult {
  valid: boolean;
  checks: DataIntegrityCheck[];
  impliedTrialCount: number;
}

export function validateAuditManifest(manifest: Partial<AuditManifest>): ManifestValidationResult {
  const checks: DataIntegrityCheck[] = [];
  required(manifest.strategy_id, "manifest_strategy_id", "strategy_id is required.", checks);
  required(manifest.researcher, "manifest_researcher", "researcher is required.", checks);
  required(manifest.asset_class, "manifest_asset_class", "asset_class is required.", checks);
  required(manifest.frequency, "manifest_frequency", "frequency is required.", checks);
  required(manifest.backtest_start, "manifest_backtest_start", "backtest_start is required.", checks);
  required(manifest.backtest_end, "manifest_backtest_end", "backtest_end is required.", checks);

  if (manifest.backtest_start && manifest.backtest_end) {
    const start = new Date(manifest.backtest_start).getTime();
    const end = new Date(manifest.backtest_end).getTime();
    checks.push({
      id: "manifest_date_order",
      severity: "critical",
      status: Number.isFinite(start) && Number.isFinite(end) && start <= end ? "pass" : "fail",
      message: "backtest_start must be on or before backtest_end."
    });
  }

  const assumptions = manifest.data_assumptions;
  if (assumptions) {
    checks.push(flagBoolean(assumptions.point_in_time, "point_in_time_data", "Point-in-time data confirmation is required for leakage governance."));
    checks.push(flagBoolean(assumptions.survivorship_free, "survivorship_free_universe", "Survivorship-free universe confirmation is required for bias governance."));
    checks.push(flagBoolean(assumptions.corporate_actions_adjusted, "corporate_actions_adjusted", "Corporate action adjustment confirmation is required."));
    checks.push(flagBoolean(assumptions.transaction_costs_included, "transaction_costs_included", "Transaction-cost inclusion should be declared."));
  } else {
    checks.push({ id: "manifest_data_assumptions", severity: "warning", status: "unknown", message: "data_assumptions were not supplied." });
  }

  const impliedTrialCount = manifest.declared_trials ?? countParameterGridTrials(manifest.parameter_grid);
  if (!impliedTrialCount) {
    checks.push({ id: "manifest_trial_count", severity: "warning", status: "unknown", message: "No declared_trials or parameter_grid was supplied." });
  }

  return {
    valid: checks.every((check) => check.status !== "fail" || check.severity !== "critical"),
    checks,
    impliedTrialCount
  };
}

function required(value: unknown, id: string, message: string, checks: DataIntegrityCheck[]): void {
  checks.push({ id, severity: "critical", status: value ? "pass" : "fail", message });
}

function flagBoolean(value: boolean | undefined, id: string, message: string): DataIntegrityCheck {
  return { id, severity: value ? "info" : "warning", status: value === true ? "pass" : value === false ? "fail" : "unknown", message };
}
