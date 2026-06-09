import * as pro from "./auditPro.js";
import * as plus from "./auditPlus.js";

export const detectSchema = pro.detectSchema;
export const parseRecords = pro.parseRecords;
export const formatPercent = pro.formatPercent;
export const formatNumber = pro.formatNumber;

export function auditDataset(parsed, meta = {}) {
  const schema = parsed.schema || meta.schema || {};
  if (schema.mode === "factor_cost_panel") {
    const report = plus.auditDataset(parsed, meta);
    report.schemaRoles = schema.columnRoles || null;
    report.factorCostPanel = {
      factorColumns: schema.factorColumns || [],
      netStrategyColumns: schema.netColumns || [],
      grossStrategyColumns: schema.grossColumns || [],
      excludedCostColumns: Object.entries(schema.columnRoles || {}).filter((entry) => ["turnover", "cost_field", "capacity_field"].includes(entry[1])).map((entry) => entry[0])
    };
    return report;
  }
  return pro.auditDataset(parsed, meta);
}

export function generateMarkdownReport(report) {
  return pro.generateMarkdownReport(report);
}
