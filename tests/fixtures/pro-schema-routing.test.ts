import { describe, expect, it } from "vitest";
import { auditDataset, detectSchema, parseRecords } from "../../src/math/audit.js";

function parse(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\n+/);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => Object.fromEntries(line.split(",").map((value, index) => [header[index], value])));
}

function run(text: string) {
  const data = parse(text);
  const schema = detectSchema(data);
  const parsed = parseRecords(data, schema);
  return { schema, report: auditDataset(parsed, { label: "fixture.csv", schema, parseErrors: [], preprocessingNotes: [] }) };
}

describe("professional schema routing", () => {
  it("routes factor cost panels and excludes turnover fields", () => {
    const out = run(`date,mkt,size,value,momentum,quality,low_vol,rates,credit,vol_change,strategy_alpha_gross,strategy_alpha_net,turnover_alpha,avg_spread_bps,borrow_bps_annual,adv_participation
2020-01-01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.002,0.001,0.5,8,100,0.02
2020-01-02,-0.01,0.00,0.01,0.00,0.01,0.00,0.01,0.00,0.01,0.001,0.0005,0.4,8,100,0.02
2020-01-03,0.01,0.01,0.00,0.01,0.00,0.01,0.00,0.01,0.00,0.003,0.002,0.3,8,100,0.02`);
    expect(out.schema.mode).toBe("factor_cost_panel");
    expect(out.schema.returnColumns).toContain("strategy_alpha_net");
    expect(out.schema.returnColumns).not.toContain("turnover_alpha");
  });

  it("routes signal panels and never selects future return labels", () => {
    const out = run(`asof_date,symbol,signal_clean_pit,signal_leaky_post_event,earnings_available_date,leakage_flag_available_after_asof,future_return_5d,future_return_20d
2020-01-01,A,0.1,0.3,2020-01-04,1,0.01,0.02
2020-01-01,B,-0.1,-0.2,2020-01-04,1,-0.01,-0.02`);
    expect(out.schema.mode).toBe("point_in_time_signal_panel");
    expect(out.schema.returnColumns).toHaveLength(0);
    expect(out.report.signalPanelAudit.bindingRule).toBe("point_in_time_leakage");
    expect(out.report.verdict.status).toBe("Reject");
  });
});
