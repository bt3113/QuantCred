const FACTORS = new Set(["mkt", "mkt_rf", "market", "size", "smb", "value", "hml", "momentum", "mom", "quality", "low_vol", "rates", "credit", "vol_change"]);
const RF = new Set(["rf", "risk_free", "risk_free_return"]);
const MACRO_LEVEL = new Set(["realgdp", "realcons", "realinv", "realgovt", "realdpi", "cpi", "m1", "pop"]);
const MACRO_RATE = new Set(["tbilrate", "unemp", "infl", "realint", "ibo", "ide"]);
const COINTEGRATION = new Set(["lrm", "lry", "lpy", "ibo", "ide", "d_lrm", "d_lry", "d_lpy", "d_ibo", "d_ide", "bond_deposit_spread", "money_income_gap", "real_money_price_gap"]);
const FUNDAMENTALS = new Set(["invest", "capital", "value", "market_cap"]);

export function roleSchema(rows) {
  const columns = columnsOf(rows);
  const roles = Object.fromEntries(columns.map((column) => [column, roleOf(column, rows)]));
  const values = Object.values(roles);
  const dateColumn = columns.find((column) => roles[column] === "date") || columns.find((column) => roles[column] === "asof_date") || columns[0];
  const returnColumns = columns.filter((column) => ["strategy_return", "gross_strategy_return", "net_strategy_return", "candidate_return"].includes(roles[column]));
  const factorColumns = columns.filter((column) => roles[column] === "factor_return");
  const labelColumns = columns.filter((column) => roles[column] === "forward_return_label");
  const signalColumns = columns.filter((column) => roles[column] === "signal");
  const grossColumns = columns.filter((column) => roles[column] === "gross_strategy_return");
  const netColumns = columns.filter((column) => roles[column] === "net_strategy_return");
  const names = new Set(columns.map(norm));
  let mode = "unsupported";
  if (names.has("trade_id") && names.has("side") && names.has("quantity") && names.has("fill_price")) mode = "execution_blotter";
  else if (values.includes("asof_date") && values.includes("symbol") && signalColumns.length && labelColumns.length) mode = "point_in_time_signal_panel";
  else if (hasCointegration(names)) mode = "macro_cointegration_panel";
  else if (hasMacro(names)) mode = "macro_time_series";
  else if (hasFirmPanel(names)) mode = "firm_fundamental_panel";
  else if (factorColumns.length && (grossColumns.length || netColumns.length)) mode = "factor_cost_panel";
  else if (grossColumns.length && netColumns.length) mode = "cost_capacity";
  else if (returnColumns.length === 1) mode = "single_return_stream";
  else if (returnColumns.length > 1) mode = "strategy_return_matrix";
  return { mode, dateColumn, columns, roles, returnColumns, factorColumns, labelColumns, signalColumns, grossColumns, netColumns };
}

export function roleOf(column, rows = []) {
  const n = norm(column);
  if (n === "date" || n === "trade_date") return "date";
  if (n === "asof_date") return "asof_date";
  if (n === "symbol" || n === "ticker") return "symbol";
  if (n === "firm" || n === "company") return "firm";
  if (n === "year" || n === "year_int" || n === "quarter" || n === "quarter_int" || n === "panel_key") return "metadata";
  if (RF.has(n)) return "risk_free_return";
  if (FACTORS.has(n)) return "factor_return";
  if (COINTEGRATION.has(n)) return n.startsWith("d_") || n.includes("spread") || n.includes("gap") ? "macro_transform" : "macro_rate";
  if (MACRO_LEVEL.has(n)) return "macro_level";
  if (MACRO_RATE.has(n)) return "macro_rate";
  if (n.endsWith("_qoq_log_change") || n.endsWith("_yoy_log_change") || n.includes("_gap") || n.includes("_spread") || n.includes("_proxy")) return "macro_transform";
  if (FUNDAMENTALS.has(n)) return "fundamental_level";
  if (n.includes("_to_") || n.endsWith("_ratio") || n.endsWith("_yoy_change")) return "fundamental_ratio";
  if (n.startsWith("future_return_") || n.startsWith("forward_return_") || n.includes("target") || n.includes("label")) return "forward_return_label";
  if (n.startsWith("signal_") || n.includes("score") || n.endsWith("_z")) return "signal";
  if (n.startsWith("turnover") || n.endsWith("_turnover")) return "turnover";
  if (n.includes("borrow") && n.includes("bps")) return "cost_field";
  if (n.includes("spread") && n.includes("bps")) return "cost_field";
  if (n.includes("commission") && n.includes("bps")) return "cost_field";
  if (n.includes("slippage") && n.includes("bps")) return "cost_field";
  if (n.includes("adv") || n.includes("participation")) return "capacity_field";
  if (n.includes("price") || n.includes("mid") || n.includes("close")) return "price";
  if (n.includes("quantity")) return "quantity";
  if (n.includes("notional")) return "notional";
  if (n.endsWith("_bps")) return "cost_field";
  if (n.includes("sector") || n.includes("country") || n.includes("bucket") || n.includes("universe") || n.includes("flag") || n.includes("id") || n.includes("timestamp")) return "metadata";
  if (isReturnName(n) && numericRate(rows, column) >= 0.9) {
    if (n.includes("gross") || n === "gross_return" || n === "pre_cost_return") return "gross_strategy_return";
    if (n.includes("net") || n === "expected_net_return" || n === "post_cost_return") return "net_strategy_return";
    return "strategy_return";
  }
  if (numericRate(rows, column) >= 0.9 && plausibleReturn(rows, column)) return "candidate_return";
  if (numericRate(rows, column) >= 0.9) return "unknown_numeric";
  return "metadata";
}

function hasCointegration(names) { return ["lrm", "lry", "lpy", "ibo", "ide"].filter((name) => names.has(name)).length >= 3; }
function hasMacro(names) { return ["realgdp", "realcons", "realinv", "cpi", "m1", "tbilrate", "unemp", "infl", "realint"].filter((name) => names.has(name)).length >= 3; }
function hasFirmPanel(names) { return (names.has("firm") || names.has("company") || names.has("panel_key")) && (names.has("year") || names.has("year_int")) && ["invest", "capital", "value"].filter((name) => names.has(name)).length >= 2; }
function isReturnName(n) { return n === "return" || n === "gross_return" || n === "net_return" || n === "expected_net_return" || n === "post_cost_return" || n === "pre_cost_return" || n.endsWith("_return") || n.endsWith("_gross") || n.endsWith("_net"); }
function norm(name) { return String(name).trim().toLowerCase().replace(/[- ]/g, "_"); }
function columnsOf(rows) { const sample = rows.find((row) => row && Object.keys(row).length); return sample ? Object.keys(sample).map((column) => column.trim()).filter(Boolean) : []; }
function numericRate(rows, column) { const values = rows.map((row) => row[column]).filter((value) => value !== undefined && value !== null && value !== ""); return values.length ? values.filter((value) => Number.isFinite(toNumber(value))).length / values.length : 0; }
function plausibleReturn(rows, column) { const values = rows.map((row) => toNumber(row[column])).filter(Number.isFinite); if (values.length < 30) return false; const abs = values.map(Math.abs).sort((a, b) => a - b); const sd = sampleStd(values); return quantile(abs, 0.99) < 0.25 && abs[abs.length - 1] < 1 && sd > 1e-8 && sd < 0.2; }
function quantile(sorted, q) { const pos = (sorted.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos); return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); }
function sampleStd(values) { const avg = values.reduce((s, v) => s + v, 0) / values.length; return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / Math.max(1, values.length - 1)); }
function toNumber(value) { if (typeof value === "number") return Number.isFinite(value) ? value : null; if (typeof value !== "string") return null; const text = value.trim().replace(/%$/, "").replace(/,/g, ""); const number = Number(text); return Number.isFinite(number) ? value.trim().endsWith("%") ? number / 100 : number : null; }
