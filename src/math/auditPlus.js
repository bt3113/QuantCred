import * as base from "./audit-v5.js";
import { computeTimeSeriesCv } from "./timeSeriesCv.js";
import { detectFactorColumns, computeFactorAttribution } from "./factorAttribution.js";

export const formatPercent = base.formatPercent;
export const formatNumber = base.formatNumber;

export function detectSchema(rows) {
  const schema = base.detectSchema(rows);
  if (schema.canAudit === false) return schema;
  const factorInfo = detectFactorColumns(rows);
  if (factorInfo.factors.length && factorInfo.returns.length) {
    return { ...schema, mode: "factor_attribution", returnColumns: [factorInfo.returns[0]], factorColumns: factorInfo.factors };
  }
  return factorInfo.factors.length ? { ...schema, factorColumns: factorInfo.factors } : schema;
}

export function parseRecords(rows, schema) {
  return { ...base.parseRecords(rows, schema), originalRows: rows };
}

export function auditDataset(parsed, meta = {}) {
  const governance = readGovernanceSettings();
  const mergedMeta = {
    ...meta,
    validationConfig: meta.validationConfig || governance.validationConfig,
    trialLedger: meta.trialLedger || governance.trialLedger,
    manifest: meta.manifest || governance.manifest
  };
  const report = base.auditDataset(parsed, mergedMeta);
  const schema = parsed.schema || mergedMeta.schema || {};
  if (report.verdict?.status !== "Audit blocked") {
    report.timeSeriesCv = computeTimeSeriesCv(parsed.observations || [], mergedMeta.validationConfig || {});
    report.searchHistory = summarizeSearchHistory(report, mergedMeta.trialLedger || [], mergedMeta.manifest || null);
    if (schema.factorColumns?.length) {
      report.factorAttribution = computeFactorAttribution(parsed.originalRows || [], report.selected?.name, schema.factorColumns);
      if (report.factorAttribution?.status === "computed" && report.factorAttribution.rawSharpe > 1.5 && report.factorAttribution.residualProxySharpe < 0.5) {
        report.factorAttribution.bindingRule = "factor_explained_performance";
        setResearchMore(report, `Raw annualized Sharpe is ${base.formatNumber(report.factorAttribution.rawSharpe, 2)}, but factor-residual proxy Sharpe is ${base.formatNumber(report.factorAttribution.residualProxySharpe, 2)}.`);
      }
    }
    if (report.timeSeriesCv?.status === "not_configured" && report.verdict.status === "Credible") setResearchMore(report, "Time-series gap validation is not configured.");
    if (report.searchHistory?.source === "single_stream_only" && report.verdict.status === "Credible") setResearchMore(report, "Only one selected stream was supplied, so the research search process cannot be audited.");
  }
  return report;
}

export function generateMarkdownReport(report) {
  return base.generateMarkdownReport(report) + factorMarkdown(report) + cvMarkdown(report) + searchMarkdown(report);
}

function readGovernanceSettings() {
  const defaults = { validationConfig: {}, trialLedger: [], manifest: null };
  try {
    if (typeof globalThis !== "undefined" && globalThis.quantcredGovernance) return { ...defaults, ...globalThis.quantcredGovernance };
    if (typeof localStorage !== "undefined") return { ...defaults, ...JSON.parse(localStorage.getItem("quantcredGovernance") || "{}") };
  } catch (_error) {
    return defaults;
  }
  return defaults;
}

function summarizeSearchHistory(report, ledger, manifest) {
  const matrix = report.summary?.strategyCount > 1 ? report.summary.strategyCount : 0;
  const ledgerCount = Array.isArray(ledger) ? ledger.length : 0;
  const manifestCount = Number(manifest?.declared_trials || manifest?.declaredTrials || 0);
  if (matrix) return { source: "strategy_matrix_columns", effectiveCount: matrix, confidence: "high", ledgerEntries: ledgerCount };
  if (ledgerCount) return { source: "trial_ledger", effectiveCount: ledgerCount, confidence: "medium", ledgerEntries: ledgerCount };
  if (manifestCount) return { source: "manifest_declared_trials", effectiveCount: manifestCount, confidence: "medium", ledgerEntries: ledgerCount };
  return { source: "single_stream_only", effectiveCount: 1, confidence: "low", ledgerEntries: ledgerCount };
}

function setResearchMore(report, reason) {
  report.score.decision = "research_more";
  report.score.overrides = [...new Set([...(report.score.overrides || []), reason])];
  report.verdict = { status: "Research more", title: "Additional governance evidence required", reason };
}

function factorMarkdown(report) {
  const item = report.factorAttribution;
  if (!item) return "";
  return `\n## Factor Attribution\n\n- Status: ${item.status}\n- Selected stream: ${item.selectedColumn || "N/A"}\n- Factors: ${(item.factorColumns || []).join(", ")}\n- Observations: ${item.observations}\n- Raw annualized Sharpe: ${base.formatNumber(item.rawSharpe, 4)}\n- Factor-residual proxy Sharpe: ${base.formatNumber(item.residualProxySharpe, 4)}\n- Max absolute factor correlation: ${base.formatNumber(item.maxAbsCorrelation, 4)}\n- Binding rule: ${item.bindingRule || "N/A"}\n`;
}
function cvMarkdown(report) {
  const item = report.timeSeriesCv;
  if (!item) return "";
  const removed = item.foldSummaries?.reduce((sum, fold) => sum + fold.removedRows, 0) || 0;
  return `\n## Purged / Embargoed Validation\n\n- Status: ${item.status}\n- Folds: ${item.folds}\n- Purge days: ${item.leftGap}\n- Embargo days: ${item.rightGap}\n- Removed rows across folds: ${removed}\n`;
}
function searchMarkdown(report) {
  const item = report.searchHistory;
  if (!item) return "";
  return `\n## Trial Ledger / Search Governance\n\n- Effective count source: ${item.source}\n- Effective count: ${item.effectiveCount}\n- Confidence: ${item.confidence}\n- Ledger entries loaded: ${item.ledgerEntries}\n`;
}
