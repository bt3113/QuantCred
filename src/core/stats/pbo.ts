import type { PboConfig, PboResult } from "../types";
import { returnVolatilityRatio } from "./ratio";
import { median, mean } from "./moments";

export type StrategyReturnMatrix = Record<string, number[]>;

export function computePbo(matrix: StrategyReturnMatrix, config: PboConfig): PboResult {
  const names = Object.keys(matrix);
  if (names.length < 3) throw new Error("PBO requires at least three strategy variants.");
  const length = Math.min(...names.map((name) => matrix[name].length));
  if (length < config.partitions) throw new Error("PBO requires at least as many observations as partitions.");

  const partitions = splitIndexes(length, config.partitions);
  const trainSize = Math.max(config.minTrainPartitions, Math.floor(config.partitions / 2));
  const combos = combinations([...Array(config.partitions).keys()], trainSize);
  const logitValues: number[] = [];
  const inSampleRanks: number[] = [];
  const outOfSampleRanks: number[] = [];
  const inSampleScores: number[] = [];
  const outOfSampleScores: number[] = [];

  for (const trainPartitions of combos) {
    const trainSet = new Set(trainPartitions);
    const testPartitions = [...Array(config.partitions).keys()].filter((idx) => !trainSet.has(idx));
    if (!testPartitions.length) continue;

    const trainIndexes = trainPartitions.flatMap((idx) => partitions[idx]);
    const testIndexes = testPartitions.flatMap((idx) => partitions[idx]);
    const trainScores = rankScores(names, matrix, trainIndexes, config.metric);
    const selected = trainScores[0];
    if (!selected) continue;

    const testScores = rankScores(names, matrix, testIndexes, config.metric);
    const selectedTestIndex = testScores.findIndex((item) => item.name === selected.name);
    if (selectedTestIndex < 0) continue;

    const outRank = selectedTestIndex + 1;
    const normalizedRank = (testScores.length - outRank + 1) / (testScores.length + 1);
    const lambda = Math.log(normalizedRank / (1 - normalizedRank));

    logitValues.push(lambda);
    inSampleRanks.push(1);
    outOfSampleRanks.push(outRank);
    inSampleScores.push(selected.score);
    outOfSampleScores.push(testScores[selectedTestIndex].score);
  }

  const pbo = logitValues.filter((value) => value < 0).length / Math.max(1, logitValues.length);
  return {
    pbo,
    logitValues,
    inSampleRanks,
    outOfSampleRanks,
    degradation: mean(inSampleScores) - mean(outOfSampleScores),
    selectedStrategyMedianOosRank: median(outOfSampleRanks)
  };
}

function rankScores(names: string[], matrix: StrategyReturnMatrix, indexes: number[], metric: PboConfig["metric"]): Array<{ name: string; score: number }> {
  return names
    .map((name) => ({ name, score: scoreSeries(indexes.map((idx) => matrix[name][idx]), metric) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score);
}

function scoreSeries(values: number[], metric: PboConfig["metric"]): number {
  if (metric === "return_drawdown") {
    const total = values.reduce((equity, value) => equity * (1 + value), 1) - 1;
    const worst = values.reduce((minValue, value) => Math.min(minValue, value), 0);
    return worst < 0 ? total / Math.abs(worst) : total;
  }
  return returnVolatilityRatio(values);
}

function splitIndexes(length: number, partitions: number): number[][] {
  const blocks = Array.from({ length: partitions }, () => [] as number[]);
  for (let i = 0; i < length; i += 1) {
    blocks[Math.min(partitions - 1, Math.floor((i * partitions) / length))].push(i);
  }
  return blocks;
}

function combinations(items: number[], k: number): number[][] {
  const out: number[][] = [];
  const path: number[] = [];
  const walk = (start: number) => {
    if (path.length === k) {
      out.push([...path]);
      return;
    }
    for (let i = start; i <= items.length - (k - path.length); i += 1) {
      path.push(items[i]);
      walk(i + 1);
      path.pop();
    }
  };
  walk(0);
  return out;
}
