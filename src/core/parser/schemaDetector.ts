import type { InputMode } from "../types";

export interface SchemaDetectionResult {
  mode: InputMode;
  dateColumn?: string;
  returnColumns: string[];
  requiredMissing: string[];
  confidence: number;
  notes: string[];
}

const REQUIRED_TRADES = ["date", "symbol", "side", "quantity", "price"];
const REQUIRED_POSITIONS = ["date", "symbol", "weight"];
const REQUIRED_MANIFEST = ["strategy_id", "asset_class", "frequency", "backtest_start", "backtest_end"];

export function detectInputSchema(rows: Array<Record<string, unknown>> | Record<string, unknown>): SchemaDetectionResult {
  if (!Array.isArray(rows)) return detectManifest(rows);
  const sample = rows.find((row) => row && Object.keys(row).length > 0);
  if (!sample) return emptyDetection("single_return_stream", ["date", "return"], "No rows found.");

  const columns = Object.keys(sample).map((key) => key.trim()).filter(Boolean);
  const lower = new Map(columns.map((column) => [column.toLowerCase(), column]));
  const dateColumn = lower.get("date") ?? columns.find((column) => column.toLowerCase().includes("date"));

  if (hasRequired(lower, REQUIRED_TRADES)) {
    return result("trades", dateColumn, [], [], 0.95, ["Detected trades/orders schema."]);
  }

  if (hasRequired(lower, REQUIRED_POSITIONS)) {
    return result("positions", dateColumn, [], [], 0.95, ["Detected positions/holdings schema."]);
  }

  if (columns.some((column) => column.toLowerCase() === "regime")) {
    return result("incubation_append", dateColumn, columns.filter((column) => column !== dateColumn), [], 0.7, ["Detected date-indexed append/regime-style file."]);
  }

  const numericColumns = inferNumericColumns(rows, columns, dateColumn);
  const factorNames = new Set(["mkt", "mkt_rf", "mktrf", "smb", "hml", "umd", "mom", "momentum", "quality", "low_vol", "value", "size"]);
  const factorHits = numericColumns.filter((column) => factorNames.has(column.toLowerCase().replace(/[- ]/g, "_"))).length;

  if (factorHits >= 2) {
    return result("factor_returns", dateColumn, numericColumns, [], 0.9, ["Detected factor-return style columns."]);
  }

  if (numericColumns.length === 1) {
    return result("single_return_stream", dateColumn, numericColumns, missing(dateColumn, ["date"]), 0.9, ["Detected one numeric return stream."]);
  }

  if (numericColumns.length > 1) {
    return result("strategy_matrix", dateColumn, numericColumns, missing(dateColumn, ["date"]), 0.88, ["Detected strategy matrix from multiple numeric columns."]);
  }

  return emptyDetection("single_return_stream", ["date", "return"], "No numeric return columns detected.");
}

function detectManifest(value: Record<string, unknown>): SchemaDetectionResult {
  const missingKeys = REQUIRED_MANIFEST.filter((key) => value[key] === undefined || value[key] === null || value[key] === "");
  return result("audit_manifest", undefined, [], missingKeys, missingKeys.length ? 0.45 : 0.98, ["Detected JSON audit manifest candidate."]);
}

function inferNumericColumns(rows: Array<Record<string, unknown>>, columns: string[], dateColumn?: string): string[] {
  return columns.filter((column) => {
    if (column === dateColumn) return false;
    const inspected = rows.slice(0, 50).map((row) => row[column]).filter((value) => value !== undefined && value !== null && value !== "");
    if (!inspected.length) return false;
    const numericCount = inspected.filter((value) => Number.isFinite(typeof value === "number" ? value : Number(String(value).replace(/%$/, "").replace(/,/g, "")))).length;
    return numericCount / inspected.length >= 0.8;
  });
}

function hasRequired(lower: Map<string, string>, required: string[]): boolean {
  return required.every((column) => lower.has(column));
}

function missing(dateColumn: string | undefined, required: string[]): string[] {
  return required.filter((column) => column === "date" && !dateColumn);
}

function result(mode: InputMode, dateColumn: string | undefined, returnColumns: string[], requiredMissing: string[], confidence: number, notes: string[]): SchemaDetectionResult {
  return { mode, dateColumn, returnColumns, requiredMissing, confidence, notes };
}

function emptyDetection(mode: InputMode, requiredMissing: string[], note: string): SchemaDetectionResult {
  return { mode, returnColumns: [], requiredMissing, confidence: 0, notes: [note] };
}
