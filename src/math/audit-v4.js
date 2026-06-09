import { auditDataset as auditDatasetV3 } from "./audit-v3.js";
export { detectSchema, parseRecords, generateMarkdownReport, formatPercent, formatNumber } from "./audit-v3.js";

export function auditDataset(parsed, meta = {}) {
  const report = auditDatasetV3(parsed, meta);
  if (report.score?.decision === "audit_blocked") {
    report.score.decision = "reject";
  }
  return report;
}
