import type { ParameterAtlas, ParameterCell } from "../types";

export function buildParameterAtlas(cells: ParameterCell[]): ParameterAtlas {
  const dimensions = [...new Set(cells.flatMap((cell) => Object.keys(cell.params)))].sort();
  const best = cells.reduce((current, cell) => (cell.sharpe > current.sharpe ? cell : current), cells[0]);
  const neighbors = best ? findNeighbors(best, cells, dimensions) : [];
  const neighborMedianSharpe = median(neighbors.map((cell) => cell.sharpe));
  const plateauScore = computePlateauScore(cells, best?.sharpe ?? Number.NaN);
  const peakFragilityScore = Number.isFinite(best?.sharpe) && Number.isFinite(neighborMedianSharpe)
    ? Math.max(0, Math.min(100, ((best.sharpe - neighborMedianSharpe) / Math.max(1e-9, Math.abs(best.sharpe))) * 100))
    : Number.NaN;

  return {
    dimensions,
    cells,
    plateauScore,
    peakFragilityScore
  };
}

export function findNeighbors(target: ParameterCell, cells: ParameterCell[], dimensions: string[]): ParameterCell[] {
  return cells.filter((cell) => cell !== target && dimensions.filter((dimension) => cell.params[dimension] !== target.params[dimension]).length === 1);
}

export function computePlateauScore(cells: ParameterCell[], bestSharpe: number): number {
  if (!cells.length || !Number.isFinite(bestSharpe)) return Number.NaN;
  const threshold = bestSharpe * 0.8;
  return cells.filter((cell) => cell.sharpe >= threshold).length / cells.length * 100;
}

function median(values: number[]): number {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return Number.NaN;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
}
