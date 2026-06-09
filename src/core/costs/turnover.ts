export interface PositionRow {
  date: string;
  symbol: string;
  weight: number;
}

export interface TurnoverPoint {
  date: string;
  turnover: number;
}

export function computeTurnover(rows: PositionRow[]): TurnoverPoint[] {
  const byDate = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!Number.isFinite(row.weight)) continue;
    if (!byDate.has(row.date)) byDate.set(row.date, new Map());
    byDate.get(row.date)?.set(row.symbol, row.weight);
  }

  const dates = [...byDate.keys()].sort();
  const result: TurnoverPoint[] = [];
  let previous = new Map<string, number>();

  for (const date of dates) {
    const current = byDate.get(date) ?? new Map<string, number>();
    const symbols = new Set([...previous.keys(), ...current.keys()]);
    let absoluteChange = 0;
    for (const symbol of symbols) {
      absoluteChange += Math.abs((current.get(symbol) ?? 0) - (previous.get(symbol) ?? 0));
    }
    result.push({ date, turnover: 0.5 * absoluteChange });
    previous = current;
  }

  return result;
}

export function averageTurnover(points: TurnoverPoint[]): number {
  if (!points.length) return Number.NaN;
  return points.reduce((sum, point) => sum + point.turnover, 0) / points.length;
}
