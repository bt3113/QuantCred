import { bootstrapStatistic } from "../core/stats/bootstrap";
import { mean } from "../core/stats/moments";
import { returnVolatilityRatio } from "../core/stats/ratio";

interface BootstrapWorkerRequest {
  values: number[];
  statistic: "mean" | "return_volatility_ratio";
  iterations?: number;
  alpha?: number;
  seed?: number;
}

addEventListener("message", (event: MessageEvent<BootstrapWorkerRequest>) => {
  try {
    const statFn = event.data.statistic === "return_volatility_ratio" ? returnVolatilityRatio : mean;
    const result = bootstrapStatistic(
      event.data.values,
      statFn,
      event.data.iterations,
      event.data.alpha,
      event.data.seed
    );
    postMessage({ ok: true, result });
  } catch (error) {
    postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

export {};
