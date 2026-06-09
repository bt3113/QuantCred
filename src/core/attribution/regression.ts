import { mean } from "../stats/moments";

export interface OlsResult {
  intercept: number;
  coefficients: number[];
  fitted: number[];
  residuals: number[];
  rSquared: number;
  standardErrors: number[];
  tStats: number[];
}

export function ols(y: number[], x: number[][]): OlsResult {
  const rows = y.map((value, index) => [value, x[index]] as const)
    .filter(([value, factors]) => Number.isFinite(value) && Array.isArray(factors) && factors.every(Number.isFinite));
  if (rows.length <= (x[0]?.length ?? 0) + 1) throw new Error("OLS requires more observations than coefficients.");

  const yy = rows.map(([value]) => value);
  const xx = rows.map(([, factors]) => [1, ...factors]);
  const xt = transpose(xx);
  const xtx = multiply(xt, xx);
  const xtxInv = inverse(xtx);
  const beta = multiplyVector(multiply(xtxInv, xt), yy);
  const fitted = xx.map((row) => dot(row, beta));
  const residuals = yy.map((value, index) => value - fitted[index]);
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const sst = yy.reduce((sum, value) => sum + (value - mean(yy)) ** 2, 0);
  const dof = yy.length - beta.length;
  const sigma2 = sse / dof;
  const standardErrors = xtxInv.map((row, index) => Math.sqrt(Math.max(0, row[index] * sigma2)));
  const tStats = beta.map((value, index) => standardErrors[index] > 0 ? value / standardErrors[index] : Number.NaN);

  return {
    intercept: beta[0],
    coefficients: beta.slice(1),
    fitted,
    residuals,
    rSquared: sst > 0 ? 1 - sse / sst : Number.NaN,
    standardErrors,
    tStats
  };
}

export function hacNeweyWestVariance(residuals: number[], lag: number): number {
  const clean = residuals.filter(Number.isFinite);
  if (!clean.length) return Number.NaN;
  const n = clean.length;
  const gamma0 = clean.reduce((sum, value) => sum + value ** 2, 0) / n;
  let variance = gamma0;
  for (let l = 1; l <= lag; l += 1) {
    const weight = 1 - l / (lag + 1);
    let gamma = 0;
    for (let t = l; t < n; t += 1) gamma += clean[t] * clean[t - l];
    variance += 2 * weight * gamma / n;
  }
  return variance;
}

function transpose(matrix: number[][]): number[][] {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function multiply(a: number[][], b: number[][]): number[][] {
  return a.map((row) => b[0].map((_, col) => row.reduce((sum, value, k) => sum + value * b[k][col], 0)));
}

function multiplyVector(a: number[][], b: number[]): number[] {
  return a.map((row) => dot(row, b));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function inverse(matrix: number[][]): number[][] {
  const n = matrix.length;
  const augmented = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
    if (Math.abs(augmented[pivot][col]) < 1e-12) throw new Error("Regression matrix is singular.");
    [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
    const scale = augmented[col][col];
    augmented[col] = augmented[col].map((value) => value / scale);
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = augmented[row][col];
      augmented[row] = augmented[row].map((value, j) => value - factor * augmented[col][j]);
    }
  }
  return augmented.map((row) => row.slice(n));
}
