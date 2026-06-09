import { describe, expect, it } from "vitest";
import { mean, sampleVariance, sampleStd } from "../../src/core/stats/moments";
import { probabilisticSharpeRatio, minimumTrackRecordLength } from "../../src/core/stats/psr";
import { returnVolatilityRatio } from "../../src/core/stats/ratio";

function close(actual: number, expected: number, tolerance = 1e-10): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe("core statistics", () => {
  it("computes sample moments for a deterministic numeric series", () => {
    const values = [1, 2, 3, 4, 5];
    close(mean(values), 3);
    close(sampleVariance(values), 2.5);
    close(sampleStd(values), Math.sqrt(2.5));
  });

  it("computes native return-volatility ratio without annualization", () => {
    const returns = [0.01, 0.02, -0.01, 0.03];
    close(returnVolatilityRatio(returns), 0.75);
  });

  it("keeps PSR inside probability bounds", () => {
    const psr = probabilisticSharpeRatio(0.5, 100, 0, 3, 0);
    expect(psr).toBeGreaterThan(0);
    expect(psr).toBeLessThan(1);
  });

  it("returns infinite minimum track record when observed ratio does not beat benchmark", () => {
    expect(minimumTrackRecordLength(0, 0, 3, 0, 0.05)).toBe(Infinity);
  });
});
