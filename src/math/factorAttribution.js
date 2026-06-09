const FACTOR_NAMES = new Set(["mkt", "mkt_rf", "market", "market_return", "smb", "hml", "umd", "mom", "momentum", "quality", "low_vol", "value", "size", "carry", "trend"]);
const RETURN_NAMES = new Set(["return", "strategy_return", "excess_return", "alpha_return", "net_return", "expected_net_return"]);
const PERIODS_PER_YEAR = 252;

export function detectFactorColumns(rows) {
  const columns = columnsOf(rows);
  const factors = columns.filter((column) => FACTOR_NAMES.has(normalizeName(column)) && numericRate(rows, column) >= 0.9);
  const returns = columns.filter((column) => RETURN_NAMES.has(normalizeName(column)) && numericRate(rows, column) >= 0.9);
  return { factors, returns };
}

export function computeFactorAttribution(rows, selectedColumn, factorColumns) {
  if (!selectedColumn || !factorColumns?.length) return null;
  const y = [];
  const x = Object.fromEntries(factorColumns.map((factor) => [factor, []]));
  for (const row of rows) {
    const yy = toNumber(row[selectedColumn]);
    const vals = factorColumns.map((factor) => toNumber(row[factor]));
    if (Number.isFinite(yy) && vals.every(Number.isFinite)) {
      y.push(yy);
      factorColumns.forEach((factor, index) => x[factor].push(vals[index]));
    }
  }
  if (y.length < Math.max(30, factorColumns.length * 5)) {
    return { status: "insufficient_data", selectedColumn, factorColumns, observations: y.length };
  }
  const correlations = Object.fromEntries(factorColumns.map((factor) => [factor, correlation(y, x[factor])]));
  const maxAbsCorrelation = Math.max(...Object.values(correlations).map((value) => Math.abs(value)).filter(Number.isFinite), 0);
  const rawSharpe = sharpe(y) * Math.sqrt(PERIODS_PER_YEAR);
  const residualProxySharpe = rawSharpe * Math.sqrt(Math.max(0, 1 - maxAbsCorrelation * maxAbsCorrelation));
  return { status: "computed", selectedColumn, factorColumns, observations: y.length, rawSharpe, residualProxySharpe, correlations, maxAbsCorrelation, bindingRule: null };
}

function columnsOf(rows) { const sample = rows.find((row) => row && Object.keys(row).length); return sample ? Object.keys(sample) : []; }
function normalizeName(name) { return String(name).toLowerCase().replace(/[- ]/g, "_"); }
function numericRate(rows, column) { const values = rows.map((row) => row[column]).filter((value) => value !== undefined && value !== null && value !== ""); return values.length ? values.filter((value) => Number.isFinite(toNumber(value))).length / values.length : 0; }
function toNumber(value) { if (typeof value === "number") return Number.isFinite(value) ? value : null; if (typeof value !== "string") return null; const text = value.trim().replace(/%$/, "").replace(/,/g, ""); const number = Number(text); return Number.isFinite(number) ? value.trim().endsWith("%") ? number / 100 : number : null; }
function mean(values) { const finite = values.filter(Number.isFinite); return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : Number.NaN; }
function sampleStd(values) { const finite = values.filter(Number.isFinite); if (finite.length < 2) return Number.NaN; const avg = mean(finite); return Math.sqrt(finite.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (finite.length - 1)); }
function sharpe(values) { const sd = sampleStd(values); return Number.isFinite(sd) && sd > 0 ? mean(values) / sd : Number.NaN; }
function correlation(a, b) { const pairs = a.map((value, index) => [value, b[index]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)); if (pairs.length < 2) return Number.NaN; const x = pairs.map((pair) => pair[0]); const y = pairs.map((pair) => pair[1]); const sx = sampleStd(x); const sy = sampleStd(y); if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) return Number.NaN; const mx = mean(x); const my = mean(y); return pairs.reduce((sum, pair) => sum + (pair[0] - mx) * (pair[1] - my), 0) / ((pairs.length - 1) * sx * sy); }
