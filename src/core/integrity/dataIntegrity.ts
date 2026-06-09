import type { DataIntegrityCheck } from "../types";
import { correlation } from "../stats/moments";

export interface IntegrityInput {
  dates: string[];
  series: Record<string, number[]>;
  manifestSignals?: {
    pointInTime?: boolean;
    survivorshipFree?: boolean;
    transactionCostsIncluded?: boolean;
  };
}

export function runDataIntegrityChecks(input: IntegrityInput): DataIntegrityCheck[] {
  const checks: DataIntegrityCheck[] = [];
  checks.push(checkStrictDates(input.dates));
  checks.push(checkDuplicateDates(input.dates));
  checks.push(checkMissingValues(input.series));
  checks.push(checkReturnLowerBound(input.series));
  checks.push(checkConstantSeries(input.series));
  checks.push(checkExtremeOutliers(input.series));
  checks.push(checkNearDuplicateColumns(input.series));
  checks.push(manifestFlag("point_in_time_data", input.manifestSignals?.pointInTime, "Point-in-time data status should be confirmed."));
  checks.push(manifestFlag("survivorship_free_universe", input.manifestSignals?.survivorshipFree, "Survivorship-free universe status should be confirmed."));
  checks.push(manifestFlag("transaction_costs_included", input.manifestSignals?.transactionCostsIncluded, "Transaction-cost inclusion should be confirmed."));
  return checks;
}

function checkStrictDates(dates: string[]): DataIntegrityCheck {
  const timestamps = dates.map((date) => new Date(date).getTime());
  const pass = timestamps.every((value, index) => Number.isFinite(value) && (index === 0 || value > timestamps[index - 1]));
  return { id: "dates_strictly_increasing", severity: "critical", status: pass ? "pass" : "fail", message: "Dates must be valid and strictly increasing." };
}

function checkDuplicateDates(dates: string[]): DataIntegrityCheck {
  const unique = new Set(dates);
  return { id: "duplicate_dates", severity: "warning", status: unique.size === dates.length ? "pass" : "fail", message: "Duplicate dates can overweight observations." };
}

function checkMissingValues(series: Record<string, number[]>): DataIntegrityCheck {
  const missing = Object.values(series).flat().some((value) => !Number.isFinite(value));
  return { id: "missing_or_non_numeric_returns", severity: "warning", status: missing ? "fail" : "pass", message: "Missing or non-numeric returns were detected." };
}

function checkReturnLowerBound(series: Record<string, number[]>): DataIntegrityCheck {
  const bad = Object.values(series).flat().some((value) => Number.isFinite(value) && value <= -1);
  return { id: "return_lower_bound", severity: "critical", status: bad ? "fail" : "pass", message: "Simple returns must be greater than -100%." };
}

function checkConstantSeries(series: Record<string, number[]>): DataIntegrityCheck {
  const constant = Object.values(series).some((values) => {
    const finite = values.filter(Number.isFinite);
    return finite.length > 1 && finite.every((value) => value === finite[0]);
  });
  return { id: "constant_return_stream", severity: "critical", status: constant ? "fail" : "pass", message: "Constant return streams produce unreliable risk statistics." };
}

function checkExtremeOutliers(series: Record<string, number[]>): DataIntegrityCheck {
  const outlier = Object.values(series).flat().some((value) => Number.isFinite(value) && Math.abs(value) > 0.5);
  return { id: "extreme_return_outlier", severity: "warning", status: outlier ? "fail" : "pass", message: "At least one absolute return exceeds 50%; verify data scale and corporate-action handling." };
}

function checkNearDuplicateColumns(series: Record<string, number[]>): DataIntegrityCheck {
  const names = Object.keys(series);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      if (Math.abs(correlation(series[names[i]], series[names[j]])) > 0.999) {
        return { id: "near_duplicate_strategy_columns", severity: "warning", status: "fail", message: "Two or more strategy columns are nearly identical." };
      }
    }
  }
  return { id: "near_duplicate_strategy_columns", severity: "warning", status: "pass", message: "No near-identical strategy columns detected." };
}

function manifestFlag(id: string, value: boolean | undefined, message: string): DataIntegrityCheck {
  return { id, severity: value ? "info" : "warning", status: value === true ? "pass" : value === false ? "fail" : "unknown", message };
}
