import {
  detectSchema as baseDetectSchema,
  parseRecords as baseParseRecords,
  auditDataset as baseAuditDataset,
  generateMarkdownReport as baseMarkdown,
  formatPercent,
  formatNumber
} from "./audit-v3.js";

const PERIODS_PER_YEAR = 252;
const GROSS_NAMES = new Set(["gross_return", "gross_strategy_return", "pre_cost_return"]);
const NET_NAMES = new Set(["net_return", "expected_net_return", "post_cost_return", "strategy_net_return"]);
const META_NAMES = new Set(["turnover", "adv_participation", "fees", "notional", "quantity", "price", "symbol", "side"]);

export { formatPercent, formatNumber };

export function detectSchema(rows) {
  const base = baseDetectSchema(rows);
  const columns = getColumns(rows);
  const roles = Object.fromEntries(columns.map((column) => [column, classify(column, rows)]));
  const dateColumn = columns.find((column) => column.toLowerCase() === "date") || base.dateColumn || columns[0];
  const gross = columns.find((column) => roles[column] === "gross_return");
  const net = columns.find((column) => roles[column] === "net_return");
  const hasCostMetadata = columns.some((column) => roles[column] === "cost_or_capacity_field");

  if (gross && net && hasCostMetadata && dateRate(rows, dateColumn) >= 0.9) {
    return {
      mode: "cost_capacity",
      dateColumn,
      returnColumns: [gross, net],
      columns,
      columnRoles: roles,
      grossReturnColumn: gross,
      netReturnColumn: net,
      canAudit: true,
      dateParseRate: dateRate(rows, dateColumn),
      errors: [],
      warnings: []
    };
  }

  if (base.canAudit === false) return { ...base, columnRoles: roles };

  const filtered = (base.returnColumns || []).filter((column) => canBeReturn(column, rows));
  const excluded = (base.returnColumns || []).filter((column) => !filtered.includes(column));

  if (!filtered.length) {
    return {
      ...base,
      mode: "unsupported",
      returnColumns: [],
      columnRoles: roles,
      canAudit: false,
      reason: "No auditable return columns remain after excluding metadata, cost, and capacity fields.",
      errors: ["No auditable return columns remain after excluding metadata, cost, and capacity fields."]
    };
  }

  return { ...base, returnColumns: filtered, excludedColumns: excluded, columnRoles: roles };
}

export function parseRecords(rows, schema) {
  return {
    ...baseParseRecords(rows, schema),
    originalRows: rows,
    columnRoles: schema.columnRoles || {},
    costCapacitySchema: schema.mode === "cost_capacity" ? schema : null
  };
}

export function auditDataset(parsed, meta = {}) {
  const schema = parsed.schema || meta.schema || {};
  const selectedStrategy = schema.mode === "cost_capacity" ? schema.netReturnColumn : meta.selectedStrategy;
  const report = baseAuditDataset(parsed, { ...meta, selectedStrategy });

  if (report.verdict?.status !== "Audit blocked") {
    if (schema.mode === "cost_capacity") {
      report.costCapacity = costCapacityAudit(parsed, schema);
      applyCostCapacityRule(report);
    }
    report.tailRisk = tailRiskAudit(report.selected);
    applyTailRule(report);
    applyConsistencyRule(report);
  }
  return report;
}

export function generateMarkdownReport(report) {
  const base = baseMarkdown(report);
  if (report.verdict?.status === "Audit blocked") return base;
  return base + tailRiskMarkdown(report) + costCapacityMarkdown(report);
}

function getColumns(rows) {
  const sample = rows.find((row) => row && Object.keys(row).length);
  return sample ? Object.keys(sample).map((key) => key.trim()).filter(Boolean) : [];
}

function classify(column, rows) {
  const lower = column.toLowerCase();
  if (lower === "date") return "date";
  if (GROSS_NAMES.has(lower)) return "gross_return";
  if (NET_NAMES.has(lower)) return "net_return";
  if (META_NAMES.has(lower) || lower.endsWith("_bps") || lower.includes("participation")) return "cost_or_capacity_field";
  if (lower.includes("exposure") || lower.includes("beta")) return "exposure_or_metadata";
  if (numericRate(rows, column) >= 0.9 && plausibleReturn(rows, column)) return "strategy_return";
  if (numericRate(rows, column) >= 0.9) return "unknown_numeric";
  return "metadata";
}

function canBeReturn(column, rows) {
  const role = classify(column, rows);
  return ["strategy_return", "gross_return", "net_return"].includes(role);
}

function plausibleReturn(rows, column) {
  const values = rows.map((row) => toNumber(row[column])).filter(Number.isFinite);
  if (values.length < 2) return false;
  const abs = values.map(Math.abs).sort((a, b) => a - b);
  const sd = std(values);
  return percentile(abs, 0.99) < 0.25 && abs[abs.length - 1] < 1 && sd > 1e-8 && sd < 0.2;
}

function costCapacityAudit(parsed, schema) {
  const rows = parsed.originalRows || [];
  const gross = rows.map((row) => toNumber(row[schema.grossReturnColumn])).filter(Number.isFinite);
  const net = rows.map((row) => toNumber(row[schema.netReturnColumn])).filter(Number.isFinite);
  const paired = pair(gross, net);
  const g = paired.map((item) => item[0]);
  const n = paired.map((item) => item[1]);
  const turnover = rows.map((row) => toNumber(row.turnover)).filter(Number.isFinite);
  const adv = rows.map((row) => toNumber(row.adv_participation)).filter(Number.isFinite);
  const drag = mean(g.map((value, index) => value - n[index])) * PERIODS_PER_YEAR;

  return {
    grossReturnColumn: schema.grossReturnColumn,
    netReturnColumn: schema.netReturnColumn,
    grossAnnualizedSharpe: sharpe(g) * Math.sqrt(PERIODS_PER_YEAR),
    netAnnualizedSharpe: sharpe(n) * Math.sqrt(PERIODS_PER_YEAR),
    grossCumulativeReturn: compound(g),
    netCumulativeReturn: compound(n),
    grossMaxDrawdown: maxDrawdown(g),
    netMaxDrawdown: maxDrawdown(n),
    costDragAnnualized: drag,
    averageTurnover: mean(turnover),
    maxAdvParticipation: adv.length ? Math.max(...adv) : null,
    observationCount: paired.length,
    bindingRule: null
  };
}

function applyCostCapacityRule(report) {
  const c = report.costCapacity;
  if (!c) return;
  if (c.grossAnnualizedSharpe - c.netAnnualizedSharpe > 1 && c.netAnnualizedSharpe < 0.5) {
    c.bindingRule = "post_cost_edge_destroyed";
    report.score.decision = "reject";
    report.score.overrides = [...new Set([...(report.score.overrides || []), "Post-cost edge is materially destroyed."])] ;
    report.verdict = {
      status: "Reject",
      title: "Gross edge fails after costs",
      reason: `Gross annualized Sharpe is ${formatNumber(c.grossAnnualizedSharpe, 2)}, but net annualized Sharpe is ${formatNumber(c.netAnnualizedSharpe, 2)} after supplied cost/capacity fields.`
    };
  }
}

function tailRiskAudit(selected) {
  const skew = selected?.skewness;
  const kurt = selected?.kurtosis;
  const severe = Number.isFinite(skew) && Number.isFinite(kurt) && (skew < -3 || kurt > 40);
  const material = Number.isFinite(skew) && Number.isFinite(kurt) && (skew < -2 || kurt > 20);
  return {
    skewness: skew,
    rawKurtosis: kurt,
    severity: severe ? "reject" : material ? "research_more" : "pass",
    bindingRule: severe ? "extreme_tail_risk" : material ? "material_tail_risk" : null
  };
}

function applyTailRule(report) {
  const t = report.tailRisk;
  if (!t || t.severity === "pass") return;
  report.score.overrides = [...new Set([...(report.score.overrides || []), `Tail-risk override: skewness ${formatNumber(t.skewness, 2)}, raw kurtosis ${formatNumber(t.rawKurtosis, 2)}.`])];
  if (t.severity === "reject") {
    report.score.decision = "reject";
    report.verdict = {
      status: "Reject",
      title: "Extreme tail-risk blocker",
      reason: `The selected stream has severe left-tail or non-normal risk: skewness ${formatNumber(t.skewness, 2)} and raw kurtosis ${formatNumber(t.rawKurtosis, 2)}.`
    };
  } else if (report.verdict.status === "Credible") {
    report.score.decision = "research_more";
    report.verdict = {
      status: "Research more",
      title: "Material tail-risk warning",
      reason: `The selected stream has material non-normal tail risk: skewness ${formatNumber(t.skewness, 2)} and raw kurtosis ${formatNumber(t.rawKurtosis, 2)}.`
    };
  }
}

function applyConsistencyRule(report) {
  if (report.verdict.status === "Credible" && report.score?.decision === "reject") {
    report.verdict = { status: "Reject", title: "Decision consistency override", reason: "Headline verdict cannot be Credible when the capital-readiness decision is reject." };
  }
}

function tailRiskMarkdown(report) {
  if (!report.tailRisk) return "";
  return `\n## Tail-Risk Audit\n\n- Skewness: ${formatNumber(report.tailRisk.skewness, 4)}\n- Raw kurtosis: ${formatNumber(report.tailRisk.rawKurtosis, 4)}\n- Severity: ${report.tailRisk.severity}\n- Binding rule: ${report.tailRisk.bindingRule || "N/A"}\n`;
}

function costCapacityMarkdown(report) {
  const c = report.costCapacity;
  if (!c) return "";
  return `\n## Cost / Capacity Audit\n\n| Diagnostic | Value |\n|---|---:|\n| Gross return stream | ${c.grossReturnColumn} |\n| Net return stream | ${c.netReturnColumn} |\n| Gross annualized Sharpe | ${formatNumber(c.grossAnnualizedSharpe, 4)} |\n| Net annualized Sharpe | ${formatNumber(c.netAnnualizedSharpe, 4)} |\n| Gross cumulative return | ${formatPercent(c.grossCumulativeReturn)} |\n| Net cumulative return | ${formatPercent(c.netCumulativeReturn)} |\n| Gross max drawdown | ${formatPercent(c.grossMaxDrawdown)} |\n| Net max drawdown | ${formatPercent(c.netMaxDrawdown)} |\n| Annualized cost drag | ${formatPercent(c.costDragAnnualized)} |\n| Average turnover | ${formatPercent(c.averageTurnover)} |\n| Max ADV participation | ${formatPercent(c.maxAdvParticipation)} |\n| Binding rule | ${c.bindingRule || "N/A"} |\n`;
}

function dateRate(rows, column) {
  const values = rows.map((row) => row[column]).filter((value) => value !== undefined && value !== null && value !== "");
  if (!values.length) return 0;
  return values.filter((value) => !Number.isNaN(new Date(String(value)).getTime())).length / values.length;
}
function numericRate(rows, column) {
  const values = rows.map((row) => row[column]).filter((value) => value !== undefined && value !== null && value !== "");
  if (!values.length) return 0;
  return values.filter((value) => Number.isFinite(toNumber(value))).length / values.length;
}
function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/%$/, "").replace(/,/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? value.trim().endsWith("%") ? number / 100 : number : null;
}
function percentile(values, q) {
  const pos = (values.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? values[lo] : values[lo] + (values[hi] - values[lo]) * (pos - lo);
}
function pair(a, b) {
  const out = [];
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (Number.isFinite(a[i]) && Number.isFinite(b[i])) out.push([a[i], b[i]]);
  return out;
}
function mean(values) { const x = values.filter(Number.isFinite); return x.length ? x.reduce((sum, value) => sum + value, 0) / x.length : Number.NaN; }
function std(values) { const x = values.filter(Number.isFinite); if (x.length < 2) return Number.NaN; const m = mean(x); return Math.sqrt(x.reduce((sum, value) => sum + (value - m) ** 2, 0) / (x.length - 1)); }
function sharpe(values) { const s = std(values); return Number.isFinite(s) && s > 0 ? mean(values) / s : Number.NaN; }
function compound(values) { return values.filter(Number.isFinite).reduce((equity, value) => equity * (1 + value), 1) - 1; }
function maxDrawdown(values) { let equity = 1; let peak = 1; let worst = 0; for (const value of values.filter(Number.isFinite)) { equity *= 1 + value; peak = Math.max(peak, equity); worst = Math.min(worst, equity / peak - 1); } return worst; }
