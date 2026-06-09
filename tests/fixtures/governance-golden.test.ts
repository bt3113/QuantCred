import { describe, expect, it } from "vitest";
import { auditDataset, detectSchema, parseRecords } from "../../src/math/audit.js";

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\n+/);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])));
}

function run(csv: string, meta: Record<string, unknown> = {}) {
  const rows = parseCsv(csv);
  const schema = detectSchema(rows);
  const parsed = parseRecords(rows, schema);
  return auditDataset(parsed, { label: "fixture.csv", schema, parseErrors: [], preprocessingNotes: [], ...meta });
}

function datedRows(header: string, generator: (i: number) => string, n = 120): string {
  const rows = [header];
  const start = new Date("2020-01-01T00:00:00Z");
  for (let i = 0; i < n; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    rows.push(`${d.toISOString().slice(0, 10)},${generator(i)}`);
  }
  return rows.join("\n");
}

describe("QuantCred governance golden fixtures", () => {
  it("blocks metrics summary files instead of auditing them as returns", () => {
    const report = run("strategy,full_obs,full_sharpe\nabc,100,2.1");
    expect(report.verdict.status).toBe("Audit blocked");
  });

  it("rejects extreme tail-risk even when the average score is positive", () => {
    const csv = datedRows("date,return", (i) => (i % 50 === 0 ? "-0.1800" : "0.0025"), 500);
    const report = run(csv, { validationConfig: { folds: 5, leftGapDays: 5, rightGapDays: 5 } });
    expect(["Reject", "Research more"]).toContain(report.verdict.status);
    expect(report.tailRisk?.severity).not.toBe("pass");
  });

  it("does not select cost bps fields as strategy return streams", () => {
    const csv = datedRows("date,gross_return,turnover,spread_bps,commission_bps,borrow_bps_annual,adv_participation,expected_net_return", (i) => {
      const gross = i % 7 === 0 ? "-0.0030" : "0.0020";
      const net = i % 7 === 0 ? "-0.0040" : "0.0003";
      return `${gross},0.80,4,2,100,0.05,${net}`;
    }, 260);
    const report = run(csv, { validationConfig: { folds: 5, leftGapDays: 5, rightGapDays: 5 } });
    expect(report.summary.schemaMode).toBe("cost_capacity");
    expect(report.selected.name).toBe("expected_net_return");
    expect(report.selected.name).not.toBe("commission_bps");
  });

  it("adds search-governance evidence for matrix files", () => {
    const csv = datedRows("date,a,b,c", (i) => `${0.001 + i / 100000},${i % 2 ? 0.002 : -0.001},${i % 3 ? 0.001 : -0.002}`, 180);
    const report = run(csv, { validationConfig: { folds: 5, leftGapDays: 5, rightGapDays: 5 } });
    expect(report.searchHistory?.source).toBe("strategy_matrix_columns");
    expect(report.searchHistory?.effectiveCount).toBe(3);
  });
});
