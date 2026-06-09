export function detectExecutionBlotter(columns) {
  const names = new Set(columns.map((column) => String(column).toLowerCase()));
  return names.has("trade_id") && names.has("side") && names.has("quantity") && names.has("fill_price") && names.has("notional_usd");
}

export function auditExecutionBlotter(rows) {
  const clean = rows.filter((row) => finite(row.notional_usd));
  const totalNotional = sum(clean.map((row) => number(row.notional_usd)));
  const weighted = (column) => weightedAverage(clean, column, "notional_usd");
  const participationValues = clean.map((row) => number(row.participation_rate)).filter(Number.isFinite).sort((a, b) => a - b);
  const shortfallValues = clean.map((row) => number(row.implementation_shortfall_bps)).filter(Number.isFinite).sort((a, b) => a - b);
  const netAlpha5dBps = weighted("realized_alpha_5d_bps") - weighted("implementation_shortfall_bps") - weighted("commission_bps") - weightedBorrowBps(clean, 5);
  const sideBreakdown = ["BUY", "SELL"].map((side) => summarizeSubset(clean.filter((row) => String(row.side).toUpperCase() === side), side));
  const participationBuckets = bucketBy(clean, "participation_rate", [0.01, 0.03, 0.05, 0.1]).map((bucket) => ({
    bucket: bucket.label,
    trades: bucket.rows.length,
    notional: sum(bucket.rows.map((row) => number(row.notional_usd))),
    shortfallBps: weightedAverage(bucket.rows, "implementation_shortfall_bps", "notional_usd"),
    realizedAlpha5dBps: weightedAverage(bucket.rows, "realized_alpha_5d_bps", "notional_usd")
  }));

  return {
    status: "computed",
    tradeCount: clean.length,
    totalNotional,
    weightedExpectedAlphaBps: weighted("expected_alpha_bps"),
    weightedRealizedAlpha1dBps: weighted("realized_alpha_1d_bps"),
    weightedRealizedAlpha5dBps: weighted("realized_alpha_5d_bps"),
    weightedImplementationShortfallBps: weighted("implementation_shortfall_bps"),
    weightedSlippageBps: weighted("slippage_bps"),
    weightedCommissionBps: weighted("commission_bps"),
    weightedBorrowDrag5dBps: weightedBorrowBps(clean, 5),
    weightedNetAlpha5dBps: netAlpha5dBps,
    p95ParticipationRate: quantile(participationValues, 0.95),
    p95ShortfallBps: quantile(shortfallValues, 0.95),
    sideBreakdown,
    participationBuckets,
    bindingRule: netAlpha5dBps < 0 ? "negative_net_alpha_after_execution" : null
  };
}

function summarizeSubset(rows, label) {
  return {
    label,
    trades: rows.length,
    notional: sum(rows.map((row) => number(row.notional_usd))),
    expectedAlphaBps: weightedAverage(rows, "expected_alpha_bps", "notional_usd"),
    realizedAlpha5dBps: weightedAverage(rows, "realized_alpha_5d_bps", "notional_usd"),
    shortfallBps: weightedAverage(rows, "implementation_shortfall_bps", "notional_usd")
  };
}

function bucketBy(rows, column, breaks) {
  const buckets = breaks.map((value, index) => ({ limit: value, label: index === 0 ? `<=${value}` : `${breaks[index - 1]}-${value}`, rows: [] }));
  buckets.push({ limit: Infinity, label: `>${breaks[breaks.length - 1]}`, rows: [] });
  rows.forEach((row) => {
    const value = number(row[column]);
    const bucket = buckets.find((item) => value <= item.limit) || buckets[buckets.length - 1];
    bucket.rows.push(row);
  });
  return buckets;
}

function weightedBorrowBps(rows, days) { return weightedAverage(rows, "borrow_bps_annual", "notional_usd") * days / 252; }
function weightedAverage(rows, valueColumn, weightColumn) { const pairs = rows.map((row) => [number(row[valueColumn]), Math.abs(number(row[weightColumn]))]).filter(([value, weight]) => Number.isFinite(value) && Number.isFinite(weight) && weight > 0); const w = sum(pairs.map((pair) => pair[1])); return w > 0 ? sum(pairs.map((pair) => pair[0] * pair[1])) / w : Number.NaN; }
function quantile(sorted, q) { if (!sorted.length) return Number.NaN; const pos = (sorted.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos); return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); }
function number(value) { if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN; const parsed = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : Number.NaN; }
function finite(value) { return Number.isFinite(number(value)); }
function sum(values) { return values.filter(Number.isFinite).reduce((acc, value) => acc + value, 0); }
