import * as core from "./auditFinal.js";
import { roleSchema } from "./schemaRoles.js";

export const formatPercent = core.formatPercent;
export const formatNumber = core.formatNumber;

const PANEL_MODES = new Set(["macro_time_series", "macro_cointegration_panel", "firm_fundamental_panel"]);

export function detectSchema(rows) {
  const roles = roleSchema(rows);
  if (PANEL_MODES.has(roles.mode)) {
    return { mode: roles.mode, dateColumn: roles.dateColumn, returnColumns: [], columns: roles.columns, columnRoles: roles.roles, roleSummary: roles, canAudit: true, dateParseRate: 1, errors: [], warnings: [] };
  }
  return core.detectSchema(rows);
}

export function parseRecords(rows, schema) {
  if (PANEL_MODES.has(schema.mode)) return { observations: [], strategyNames: [], sourceRowCount: rows.length, schema, originalRows: rows };
  return core.parseRecords(rows, schema);
}

export function auditDataset(parsed, meta = {}) {
  const schema = parsed.schema || meta.schema || {};
  if (PANEL_MODES.has(schema.mode)) return panelReport(parsed, meta, schema);
  return core.auditDataset(parsed, meta);
}

export function generateMarkdownReport(report) {
  const body = report.panelAudit ? panelMarkdown(report) : core.generateMarkdownReport(report);
  return body + schemaReviewMarkdown(report);
}

function panelReport(parsed, meta, schema) {
  const audit = summarizePanel(parsed.originalRows || [], schema);
  return { generatedAt: new Date().toISOString(), version: "0.4.1", summary: { label: meta.label || "dataset", schemaMode: schema.mode, inputRows: parsed.sourceRowCount, rows: 0, strategyCount: 0, dateStart: audit.dateStart, dateEnd: audit.dateEnd }, validation: { errors: [], warnings: [], notes: [audit.reason] }, provenance: meta.provenance || null, schemaGate: schema, selected: emptySelected(), strategies: [], pbo: null, score: { total: 0, decision: "research_more", overrides: [audit.reason] }, verdict: { status: "Audit blocked", title: `Identified ${schema.mode}`, reason: audit.reason }, panelAudit: audit };
}

function summarizePanel(rows, schema) {
  const dates = rows.map((row) => parseDate(row[schema.dateColumn])).filter(Boolean).sort((a, b) => a - b);
  const reason = schema.mode === "firm_fundamental_panel" ? "Firm-year fundamentals were identified. No strategy-return audit was run; upload portfolio returns or explicitly map a return column." : schema.mode === "macro_cointegration_panel" ? "Cointegration-style macro-financial variables were identified. No Sharpe, DSR, PBO, or daily annualization was run." : "Macro time-series variables were identified. No strategy-return audit was run and daily annualization was not applied.";
  return { status: "not_applicable", schema: schema.mode, frequency: inferFrequency(dates), dateStart: dates[0] ? iso(dates[0]) : null, dateEnd: dates.at(-1) ? iso(dates.at(-1)) : null, reason };
}

function panelMarkdown(report) {
  const audit = report.panelAudit;
  return `# QuantCred Audit Report\n\nGenerated: ${report.generatedAt}\n\n## Verdict\n\n**Audit blocked: ${report.verdict.title}**\n\n${report.verdict.reason}\n\n## Dataset\n\n- Source: ${report.summary.label}\n- Schema: ${audit.schema}\n- Input rows: ${report.summary.inputRows}\n- Frequency: ${audit.frequency}\n- Date range: ${audit.dateStart || "N/A"} to ${audit.dateEnd || "N/A"}\n\nNo Sharpe, PSR, DSR, PBO, or daily annualization was run because this file is not a strategy-return dataset.\n`;
}

function schemaReviewMarkdown(report) {
  const schema = report.schemaGate || {};
  const roles = schema.columnRoles || report.schemaRoles || {};
  const entries = Object.entries(roles);
  if (!entries.length) return "";
  const rows = entries.map(([name, role]) => `| ${name} | ${role} | ${isSelectable(role) ? "yes" : "no"} |`).join("\n");
  return `\n## Schema Review\n\n- Detected schema: ${schema.mode || report.summary?.schemaMode || "unknown"}\n- Candidate return columns: ${(schema.returnColumns || []).join(", ") || "none"}\n\n| Column | Role | Selectable as strategy |\n|---|---|---:|\n${rows}\n`;
}

function isSelectable(role) { return ["strategy_return", "gross_strategy_return", "net_strategy_return", "candidate_return"].includes(role); }
function emptySelected() { return { name: "N/A", dailySharpe: null, annualizedSharpe: null, sharpe: null, psr: null, dsr: null, maxDrawdown: null, skewness: null, kurtosis: null }; }
function parseDate(value) { const date = new Date(String(value ?? "")); return Number.isNaN(date.getTime()) ? null : date; }
function iso(date) { return date.toISOString().slice(0, 10); }
function inferFrequency(dates) { if (dates.length < 2) return "unknown"; const gaps = []; for (let i = 1; i < dates.length; i += 1) gaps.push((dates[i] - dates[i - 1]) / 86400000); const gap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]; if (gap <= 3) return "daily"; if (gap <= 10) return "weekly"; if (gap <= 40) return "monthly"; if (gap <= 110) return "quarterly"; if (gap <= 400) return "annual"; return "irregular"; }
