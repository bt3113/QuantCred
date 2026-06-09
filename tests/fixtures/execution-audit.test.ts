import { describe, expect, it } from "vitest";
import { auditExecutionBlotter } from "../../src/math/executionAudit.js";

describe("execution audit", () => {
  it("computes TCA fields and flags negative net alpha", () => {
    const rows = [
      { side: "BUY", notional_usd: "1000", expected_alpha_bps: "5", realized_alpha_5d_bps: "1", realized_alpha_1d_bps: "0", implementation_shortfall_bps: "4", slippage_bps: "2", commission_bps: "0.5", borrow_bps_annual: "252", participation_rate: "0.02" },
      { side: "SELL", notional_usd: "2000", expected_alpha_bps: "5", realized_alpha_5d_bps: "-2", realized_alpha_1d_bps: "0", implementation_shortfall_bps: "5", slippage_bps: "3", commission_bps: "0.5", borrow_bps_annual: "252", participation_rate: "0.04" }
    ];
    const audit = auditExecutionBlotter(rows);
    expect(audit.status).toBe("computed");
    expect(audit.tradeCount).toBe(2);
    expect(audit.weightedNetAlpha5dBps).toBeLessThan(0);
    expect(audit.bindingRule).toBe("negative_net_alpha_after_execution");
  });
});
