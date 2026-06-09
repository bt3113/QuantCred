import * as base from "./auditPlus.js";
import { roleSchema } from "./schemaRoles.js";
import { auditExecutionBlotter } from "./executionAudit.js";
import { auditSignalPanel } from "./signalPanelAudit.js";

export const formatPercent = base.formatPercent;
export const formatNumber = base.formatNumber;

export function detectSchema(rows) {
  const roles = roleSchema(rows);
  if (roles.mode === "execution_blotter") return customSchema(roles, "execution_blotter", []);
  if (roles.mode === "point_in_time_signal_panel") return customSchema(roles, "point_in_time_signal_panel", []);
  if (roles.mode === "factor_cost_panel") return customSchema(roles, "factor_cost_panel", preferredStrategyColumns(roles));
  if (roles.mode === "cost_capacity") return customSchema(roles, "cost_capacity", roles.netColumns.length ? [roles.netColumns[0]] : roles.returnColumns);

  const schema = base.detectSchema(rows);
  const safeReturns = roles.returnColumns.filter((column) => schema.returnColumns?.includes(column) || roles.mode === "strategy_return_matrix" || roles.mode === "single_return_stream");
  return { ...schema, mode: roles.mode === "unsupported" ? schema.mode : roles.mode, returnColumns: safeReturns.length ? safeReturns : schema.returnColumns, columnRoles: roles.roles, factorColumns: roles.factorColumns, roleSummary: roles };
}

export function parseRecords(rows, schema) {
  if (["execution_blotter", "point_in_time_signal_panel"].includes(schema.mode)) {
    return { observations: [], strategyNames: [], sourceRowCount: rows.length, schema, originalRows: rows };
  }
  return { ...base.parseRecords(rows, schema), originalRows: rows };
}

export function auditDataset(parsed, meta = {}) {
  const schema = parsed.schema || meta.schema || {};
  if (schema.mode === "execution_blotter") return executionReport(parsed, meta, schema);
  if (schema.mode === "point_in_time_signal_panel") return signalReport(parsed, meta, schema);
  const preferred = schema.mode === "factor_cost_panel" && schema.returnColumns?.length ? schema.returnColumns[0] : meta.selectedStrategy;
  const report = base.auditDataset(parsed, { ...meta, selectedStrategy: preferred });
  report.schemaRoles = schema.columnRoles || null;
  if (schema.mode === "factor_cost_panel") report.factorCostPanel = factorCostPanelSummary(parsed.originalRows || [], schema);
  return report;
}

export function generateMarkdownReport(report) {
  if (report.executionAudit) return executionMarkdown(report);
  if (report.signalPanelAudit) return signalMarkdown(report);
  return base.generateMarkdownReport(report) + factorCostMarkdown(report);
}

function customSchema(roles, mode, returnColumns) {
  return { mode, dateColumn: roles.dateColumn, returnColumns, columns: roles.columns, columnRoles: roles.roles, factorColumns: roles.factorColumns, labelColumns: roles.labelColumns, signalColumns: roles.signalColumns, grossColumns: roles.grossColumns, netColumns: roles.netColumns, roleSummary: roles, canAudit: true, dateParseRate: 1, errors: [], warnings: [] };
}

function preferredStrategyColumns(roles) {
  const net = roles.netColumns.filter((name) => name.startsWith("strategy_"));
  if (net.length) return net;
  const gross = roles.grossColumns.filter((name) => name.startsWith("strategy_"));
  return gross.length ? gross : roles.returnColumns;
}

function executionReport(parsed, meta, schema) {
  const audit = auditExecutionBlotter(parsed.originalRows || []);
  const rejected = audit.bindingRule === "negative_net_alpha_after_execution";
  return {
    generatedAt: new Date().toISOString(), version: "0.4.0", summary: { label: meta.label || "dataset", schemaMode: "execution_blotter", inputRows: parsed.sourceRowCount, rows: parsed.sourceRowCount, strategyCount: 0, dateStart: null, dateEnd: null }, validation: { errors: [], warnings: [], notes: ["Execution blotter routed to transaction cost analysis. Sharpe, DSR, and PBO were not run directly on trade fields."] }, provenance: meta.provenance || null, schemaGate: schema,
    selected: emptySelected(), strategies: [], pbo: null, score: { total: rejected ? 0 : 40, decision: rejected ? "reject" : "research_more", overrides: rejected ? ["Net alpha after execution is negative."] : [] }, verdict: rejected ? { status: "Reject", title: "Execution costs overwhelm realized alpha", reason: "Weighted net alpha after shortfall, commissions, and borrow drag is negative." } : { status: "Research more", title: "Execution audit complete", reason: "Execution quality was audited; allocation still requires return-stream and live-incubation evidence." }, executionAudit: audit
  };
}

function signalReport(parsed, meta, schema) {
  const audit = auditSignalPanel(parsed.originalRows || [], schema);
  const rejected = audit.leakage.leakageRate > 0;
  return {
    generatedAt: new Date().toISOString(), version: "0.4.0", summary: { label: meta.label || "dataset", schemaMode: "point_in_time_signal_panel", inputRows: parsed.sourceRowCount, rows: parsed.sourceRowCount, strategyCount: 0, dateStart: null, dateEnd: null }, validation: { errors: [], warnings: [], notes: ["Point-in-time signal panel routed to signal/leakage analysis. Duplicate as-of dates are expected when keyed by asof_date plus symbol."] }, provenance: meta.provenance || null, schemaGate: schema,
    selected: emptySelected(), strategies: [], pbo: null, score: { total: rejected ? 0 : 45, decision: rejected ? "reject" : "research_more", overrides: rejected ? ["Point-in-time leakage detected."] : [] }, verdict: rejected ? { status: "Reject", title: "Point-in-time leakage detected", reason: `${formatPercent(audit.leakage.leakageRate)} of rows show information availability after the as-of date or an explicit leakage flag.` } : { status: "Research more", title: "Signal panel audit complete", reason: "Signal diagnostics were computed; next step is clean PIT portfolio construction." }, signalPanelAudit: audit
  };
}

function factorCostPanelSummary(rows, schema) {
  return { factorColumns: schema.factorColumns || [], netStrategyColumns: schema.netColumns || [], grossStrategyColumns: schema.grossColumns || [], excludedCostColumns: Object.entries(schema.columnRoles || {}).filter(([, role]) => ["turnover", "cost_field", "capacity_field"].includes(role)).map(([name]) => name) };
}

function emptySelected() { return { name: "N/A", dailySharpe: null, annualizedSharpe: null, sharpe: null, psr: null, dsr: null, maxDrawdown: null, skewness: null, kurtosis: null }; }

function executionMarkdown(report) { const a = report.executionAudit; return `# QuantCred Audit Report\n\nGenerated: ${report.generatedAt}\n\n## Verdict\n\n**${report.verdict.status}: ${report.verdict.title}**\n\n${report.verdict.reason}\n\n## Dataset\n\n- Source: ${report.summary.label}\n- Schema: execution_blotter\n- Trades: ${a.tradeCount}\n- Total notional: ${formatNumber(a.totalNotional, 2)}\n\n## Execution / TCA Audit\n\n| Diagnostic | Value |\n|---|---:|\n| Weighted expected alpha bps | ${formatNumber(a.weightedExpectedAlphaBps, 4)} |\n| Weighted realized alpha 1d bps | ${formatNumber(a.weightedRealizedAlpha1dBps, 4)} |\n| Weighted realized alpha 5d bps | ${formatNumber(a.weightedRealizedAlpha5dBps, 4)} |\n| Weighted implementation shortfall bps | ${formatNumber(a.weightedImplementationShortfallBps, 4)} |\n| Weighted slippage bps | ${formatNumber(a.weightedSlippageBps, 4)} |\n| Weighted borrow drag 5d bps | ${formatNumber(a.weightedBorrowDrag5dBps, 4)} |\n| Weighted net alpha 5d bps | ${formatNumber(a.weightedNetAlpha5dBps, 4)} |\n| P95 participation rate | ${formatPercent(a.p95ParticipationRate)} |\n| P95 shortfall bps | ${formatNumber(a.p95ShortfallBps, 4)} |\n| Binding rule | ${a.bindingRule || "N/A"} |\n`; }

function signalMarkdown(report) { const a = report.signalPanelAudit; return `# QuantCred Audit Report\n\nGenerated: ${report.generatedAt}\n\n## Verdict\n\n**${report.verdict.status}: ${report.verdict.title}**\n\n${report.verdict.reason}\n\n## Dataset\n\n- Source: ${report.summary.label}\n- Schema: point_in_time_signal_panel\n- Rows: ${a.rowCount}\n- Duplicate as-of dates expected: true\n- Duplicate asof_date+symbol keys: ${a.duplicateKeyCount}\n\n## Point-in-Time Leakage Audit\n\n| Diagnostic | Value |\n|---|---:|\n| Signal columns | ${a.signalColumns.join(", ")} |\n| Label columns | ${a.labelColumns.join(", ")} |\n| Leaked rows | ${a.leakage.leakedRows} |\n| Leakage rate | ${formatPercent(a.leakage.leakageRate)} |\n| Best IC pair | ${a.bestIc ? `${a.bestIc.signal} vs ${a.bestIc.label}` : "N/A"} |\n| Best mean IC | ${a.bestIc ? formatNumber(a.bestIc.meanIc, 4) : "N/A"} |\n| Best IC t-stat | ${a.bestIc ? formatNumber(a.bestIc.icTStat, 4) : "N/A"} |\n| Binding rule | ${a.bindingRule || "N/A"} |\n\nNo Sharpe, DSR, or PBO was run on future_return labels because labels are not strategy return streams.\n`; }

function factorCostMarkdown(report) { const item = report.factorCostPanel; if (!item) return ""; return `\n## Factor / Cost Panel Routing\n\n- Factor columns: ${item.factorColumns.join(", ")}\n- Net strategy columns: ${item.netStrategyColumns.join(", ")}\n- Gross strategy columns: ${item.grossStrategyColumns.join(", ")}\n- Excluded cost/capacity columns: ${item.excludedCostColumns.join(", ")}\n`; }
