import { computePbo, type StrategyReturnMatrix } from "../core/stats/pbo";
import type { PboConfig } from "../core/types";

interface PboWorkerRequest {
  matrix: StrategyReturnMatrix;
  config: PboConfig;
}

addEventListener("message", (event: MessageEvent<PboWorkerRequest>) => {
  try {
    postMessage({ ok: true, result: computePbo(event.data.matrix, event.data.config) });
  } catch (error) {
    postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

export {};
