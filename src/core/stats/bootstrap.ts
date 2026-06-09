export interface BootstrapResult {
  statistic: number;
  samples: number[];
  lower: number;
  upper: number;
}

export function bootstrapStatistic(
  values: number[],
  statistic: (sample: number[]) => number,
  iterations = 1000,
  alpha = 0.05,
  seed = 123456789
): BootstrapResult {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) throw new Error("Bootstrap requires at least one finite observation.");
  const rng = seededRandom(seed);
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const sample = Array.from({ length: clean.length }, () => clean[Math.floor(rng() * clean.length)]);
    samples.push(statistic(sample));
  }
  samples.sort((a, b) => a - b);
  return {
    statistic: statistic(clean),
    samples,
    lower: quantileSorted(samples, alpha / 2),
    upper: quantileSorted(samples, 1 - alpha / 2)
  };
}

function quantileSorted(values: number[], q: number): number {
  if (!values.length) return Number.NaN;
  const pos = (values.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (pos - lower);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
