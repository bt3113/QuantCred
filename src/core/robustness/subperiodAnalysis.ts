import type { SubperiodResult } from "../types";
import { mean, rawKurtosis, sampleSkewness, sampleStd } from "../stats/moments";
import { returnVolatilityRatio } from "../stats/ratio";
import { maximumEquityDecline } from "../stats/decline";

export interface DatedReturn {
  date: string;
  value: number;
}

export function calendarYearSubperiods(rows: DatedReturn[], periodsPerYear = 252): SubperiodResult[] {
  const groups = new Map<string, DatedReturn[]>();
  for (const row of rows) {
    const year = row.date.slice(0, 4);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year)?.push(row);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => summarizeSubperiod(group, periodsPerYear));
}

export function firstSecondHalf(rows: DatedReturn[], periodsPerYear = 252): SubperiodResult[] {
  const midpoint = Math.floor(rows.length / 2);
  return [rows.slice(0, midpoint), rows.slice(midpoint)].filter((part) => part.length > 0).map((part) => summarizeSubperiod(part, periodsPerYear));
}

export function summarizeSubperiod(rows: DatedReturn[], periodsPerYear = 252): SubperiodResult {
  const values = rows.map((row) => row.value).filter(Number.isFinite);
  return {
    periodStart: rows[0]?.date ?? "",
    periodEnd: rows[rows.length - 1]?.date ?? "",
    annualizedReturn: Math.pow(values.reduce((equity, value) => equity * (1 + value), 1), periodsPerYear / Math.max(1, values.length)) - 1,
    annualizedVolatility: sampleStd(values) * Math.sqrt(periodsPerYear),
    sharpe: returnVolatilityRatio(values),
    maxDrawdown: maximumEquityDecline(values),
    hitRate: values.filter((value) => value > 0).length / Math.max(1, values.length),
    skew: sampleSkewness(values),
    kurtosis: rawKurtosis(values)
  };
}

export function rollingSubperiods(rows: DatedReturn[], windowSize: number, periodsPerYear = 252): SubperiodResult[] {
  const out: SubperiodResult[] = [];
  for (let start = 0; start + windowSize <= rows.length; start += 1) {
    out.push(summarizeSubperiod(rows.slice(start, start + windowSize), periodsPerYear));
  }
  return out;
}
