import { describe, expect, it } from "vitest";
import { auditDataset, detectSchema, parseRecords } from "../../src/math/audit.js";

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\n+/);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])));
}

function run(text: string) {
  const rows = parseCsv(text);
  const schema = detectSchema(rows);
  const parsed = parseRecords(rows, schema);
  const report = auditDataset(parsed, { label: "fixture.csv", schema, parseErrors: [], preprocessingNotes: [] });
  return { schema, report };
}

describe("macro and fundamental panel routing", () => {
  it("blocks macro quarterly data from strategy-return audit", () => {
    const result = run(`date,year_int,quarter_int,realgdp,realcons,realinv,cpi,m1,tbilrate,unemp,infl,realint,cpi_yoy_log_change
2000-03-31,2000,1,100,80,20,90,50,2,5,1,1,0.01
2000-06-30,2000,2,101,81,21,91,51,2,5,1,1,0.02
2000-09-30,2000,3,102,82,22,92,52,2,5,1,1,0.03`);
    expect(result.schema.mode).toBe("macro_time_series");
    expect(result.schema.returnColumns).toHaveLength(0);
    expect(result.report.verdict.status).toBe("Audit blocked");
    expect(result.report.panelAudit.frequency).toBe("quarterly");
  });

  it("blocks cointegration variables from Sharpe and PBO", () => {
    const result = run(`date,lrm,lry,lpy,ibo,ide,d_lrm,d_lry,d_lpy,bond_deposit_spread,money_income_gap
1974-01-01,1,2,3,0.1,0.05,,0.01,0.02,0.05,2
1974-04-01,1.1,2.1,3.1,0.11,0.05,0.1,0.01,0.02,0.06,2
1974-07-01,1.2,2.2,3.2,0.12,0.05,0.1,0.01,0.02,0.07,2`);
    expect(result.schema.mode).toBe("macro_cointegration_panel");
    expect(result.schema.returnColumns).toHaveLength(0);
    expect(result.report.verdict.status).toBe("Audit blocked");
  });

  it("identifies firm-year fundamentals without selecting accounting variables", () => {
    const result = run(`panel_key,firm,year_int,invest,value,capital,investment_to_capital
A_2000,A,2000,10,100,50,0.2
A_2001,A,2001,11,105,55,0.2
B_2000,B,2000,20,200,100,0.2`);
    expect(result.schema.mode).toBe("firm_fundamental_panel");
    expect(result.schema.returnColumns).toHaveLength(0);
    expect(result.report.verdict.status).toBe("Audit blocked");
  });
});
