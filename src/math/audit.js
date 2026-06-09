export function detectSchema(rows) {
  const sample = rows.find((row) => row && Object.keys(row).some((key) => row[key] !== null && row[key] !== ""));
  if (!sample) return { mode: "empty", dateColumn: null, returnColumns: [] };

  const columns = Object.keys(sample).map((key) => key.trim()).filter(Boolean);
  const dateColumn = columns.find((column) => column.toLowerCase() === "date")
    || columns.find((column) => column.toLowerCase().includes("date"))
    || columns[0];

  const returnColumn = columns.find((column) => column.toLowerCase() === "return");
  const numericColumns = columns.filter((column) => column !== dateColumn && column.toLowerCase() !== "strategy_id");

  if (returnColumn) return { mode: "single", dateColumn, returnColumns: [returnColumn] };
  if (numericColumns.length >= 2) return { mode: "matrix", dateColumn, returnColumns: numericColumns };
  if (numericColumns.length === 1) return { mode: "single", dateColumn, returnColumns: numericColumns };
  return { mode: "unknown", dateColumn, returnColumns: [] };
}

export function parseRecords(rows, schema) {
  const observations = [];
  const strategyNames = schema.returnColumns || [];

  for (const row of rows) {
    if (!row || !schema.dateColumn) continue;
    const rawDate = row[schema.dateColumn];
    if (rawDate === null || rawDate === undefined || rawDate === "") continue;

    const date = new Date(rawDate);
    const values = {};
    let hasNumber = false;

    for (const name of strategyNames) {
      const value = normalizeNumber(row[name]);
      values[name] = value;
      if (Number.isFinite(value)) hasNumber = true;
    }

    if (hasNumber) {
      observations.push({
        date: Number.isNaN(date.getTime()) ? null : date,
        rawDate,
        values
      });
    }
  }

  observations.sort((a, b) => {
    const da = a.date ? a.date.getTime() : Number.MAX_SAFE_INTEGER;
    const db = b.date ? b.date.getTime() : Number.MAX_SAFE_INTEGER;
    return da - db;
  });

  return { observations, strategyNames };
}

export function auditDataset(parsed, meta = {}) {
  const validation = validate(parsed, meta);
  const strategySeries = buildStrategySeries(parsed);
  const summary = {
    label: meta.label || "dataset",
    schemaMode: meta.schema?.mode || "unknown",
    rows: parsed.observations.length,
    strategyCount: strategySeries.length
  };

  if (strategySeries.length === 0 || parsed.observations.length < 2) {
    return emptyReport(summary, validation);
  }

  const strategyMetrics = strategySeries.map((series) => ({
    name: series.name,
    returns: series.returns,
    ...computeSeriesMetrics(series.returns)
  }));

  const selected = selectStrategy(strategyMetrics);
  const allSharpes = strategyMetrics.map((item) => item.sharpe).filter(Number.isFinite);

  let dsr = null;
  let dsrSharpeHurdle = null;
  if (allSharpes.length > 1) {
    const dsrResult = computeDsr(selected.returns, allSharpes);
    dsr = dsrResult.dsr;
    dsrSharpeHurdle = dsrResult.hurdle;
  }

  const selectedWithDeflation = { ...selected, dsr, dsrSharpeHurdle };

  const pbo = strategySeries.length >= 3 && parsed.observations.length >= 32
    ? computePbo(parsed, 8)
    : null;

  const verdict = makeVerdict({ selected: selectedWithDeflation, pbo, validation, summary });

  return {
    generatedAt: new Date().toISOString(),
    summary,
    validation,
    selected: selectedWithDeflation,
    strategies: strategyMetrics.map(({ returns, ...rest }) => rest),
    pbo,
    verdict
  };
}

function emptyReport(summary, validation) {
  return {
    generatedAt: new Date().toISOString(),
    summary,
    validation,
    selected: {
      name: "N/A",
      sharpe: null,
      psr: null,
      dsr: null,
      minTrackRecordLength: null,
      maxDrawdown: null,
      skewness: null,
      kurtosis: null
    },
    strategies: [],
    pbo: null,
    verdict: {
      status: "Insufficient data",
      title: "Insufficient data",
      reason: "The file does not contain enough valid numeric return observations to run an audit."
    }
  };
}

function validate(parsed, meta) {
  const errors = [];
  const warnings = [];

  if (meta.parseErrors?.length) {
    warnings.push(`${meta.parseErrors.length} CSV parsing warning(s) were reported by the parser.`);
  }

  if (!parsed.observations.length) errors.push("No valid observations were found.");
  if (!parsed.strategyNames.length) errors.push("No return columns were detected. Use date,return or date,strategy_a,strategy_b,...");

  const invalidDates = parsed.observations.filter((row) => !row.date).length;
  if (invalidDates) warnings.push(`${invalidDates} row(s) have invalid or missing dates.`);

  const duplicates = countDuplicateDates(parsed.observations);
  if (duplicates > 0) warnings.push(`${duplicates} duplicate date(s) detected. Duplicate rows can distort statistics.`);

  if (parsed.observations.length < 30) warnings.push("Fewer than 30 observations. Statistical diagnostics may be unstable.");

  const allReturns = [];
  parsed.observations.forEach((row) => {
    parsed.strategyNames.forEach((name) => {
      if (Number.isFinite(row.values[name])) allReturns.push(row.values[name]);
    });
  });

  if (allReturns.length && median(allReturns.map(Math.abs)) > 1) {
    warnings.push("Median absolute return is greater than 1. Values may be percentages rather than decimal returns.");
  }

  const missingCount = parsed.observations.reduce((count, row) => {
    return count + parsed.strategyNames.filter((name) => !Number.isFinite(row.values[name])).length;
  }, 0);

  if (missingCount) warnings.push(`${missingCount} missing/non-numeric return cell(s) were ignored.`);
  return { errors, warnings };
}

function countDuplicateDates(observations) {
  const seen = new Set();
  let duplicates = 0;
  for (const row of observations) {
    if (!row.date) continue;
    const key = row.date.toISOString().slice(0, 10);
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  return duplicates;
}

function buildStrategySeries(parsed) {
  return parsed.strategyNames.map((name) => ({
    name,
    returns: parsed.observations.map((row) => row.values[name]).filter(Number.isFinite)
  })).filter((series) => series.returns.length >= 2);
}

function selectStrategy(strategyMetrics) {
  return [...strategyMetrics].sort((a, b) => numericSortDesc(a.sharpe, b.sharpe))[0];
}

function numericSortDesc(a, b) {
  if (!Number.isFinite(a) && !Number.isFinite(b)) return 0;
  if (!Number.isFinite(a)) return 1;
  if (!Number.isFinite(b)) return -1;
  return b - a;
}

function computeSeriesMetrics(returns) {
  const avg = mean(returns);
  const sd = sampleStd(returns);
  const sharpe = sd > 0 ? avg / sd : null;
  const skew = sampleSkewness(returns);
  const kurt = rawKurtosis(returns);
  const psrValue = sharpe == null ? null : psr(sharpe, returns.length, skew, kurt, 0);
  const minTrl = sharpe == null ? null : minTrackRecordLength(sharpe, skew, kurt, 0, 0.05);

  return {
    observations: returns.length,
    mean: avg,
    volatility: sd,
    sharpe,
    skewness: skew,
    kurtosis: kurt,
    psr: psrValue,
    minTrackRecordLength: minTrl,
    maxDrawdown: maxDrawdown(returns),
    cumulativeReturn: cumulativeReturn(returns)
  };
}

function computeDsr(selectedReturns, trialSharpes) {
  const selectedMetrics = computeSeriesMetrics(selectedReturns);
  const finiteSharpes = trialSharpes.filter(Number.isFinite);
  const n = finiteSharpes.length;
  if (n <= 1 || selectedMetrics.sharpe == null) return { dsr: null, hurdle: null };

  const variance = sampleVariance(finiteSharpes);
  const std = Math.sqrt(Math.max(variance, 0));
  const gamma = 0.5772156649015329;
  const adjustedN = Math.max(2, n);
  const hurdle = std * (
    (1 - gamma) * inverseNormal(1 - 1 / adjustedN)
    + gamma * inverseNormal(1 - 1 / (Math.E * adjustedN))
  );

  return {
    dsr: psr(selectedMetrics.sharpe, selectedReturns.length, selectedMetrics.skewness, selectedMetrics.kurtosis, hurdle),
    hurdle
  };
}

function computePbo(parsed, blockCount = 8) {
  const rows = parsed.observations.filter((row) => row.date);
  const strategyNames = parsed.strategyNames;
  const usableRows = rows.filter((row) => strategyNames.every((name) => Number.isFinite(row.values[name])));
  if (usableRows.length < blockCount || strategyNames.length < 3) return null;

  const blocks = splitIntoBlocks(usableRows, blockCount);
  const combos = combinations([...Array(blockCount).keys()], blockCount / 2);
  const logits = [];
  const isPerformance = [];
  const oosPerformance = [];
  let oosLosses = 0;

  for (const isBlocks of combos) {
    const isSet = new Set(isBlocks);
    const oosBlocks = [...Array(blockCount).keys()].filter((idx) => !isSet.has(idx));

    const isMetrics = strategyNames.map((name) => ({ name, score: sharpeFromBlocks(blocks, isBlocks, name) }));
    const selected = isMetrics.sort((a, b) => numericSortDesc(a.score, b.score))[0];
    if (!selected || !Number.isFinite(selected.score)) continue;

    const oosScores = strategyNames.map((name) => ({ name, score: sharpeFromBlocks(blocks, oosBlocks, name) }))
      .filter((item) => Number.isFinite(item.score));

    const selectedOos = oosScores.find((item) => item.name === selected.name);
    if (!selectedOos) continue;

    const sorted = [...oosScores].sort((a, b) => a.score - b.score);
    const rankIndex = sorted.findIndex((item) => item.name === selected.name);
    const rank = rankIndex + 1;
    const w = rank / (sorted.length + 1);
    const lambda = Math.log(w / (1 - w));

    logits.push(lambda);
    isPerformance.push(selected.score);
    oosPerformance.push(selectedOos.score);
    if (selectedOos.score < 0) oosLosses += 1;
  }

  if (!logits.length) return null;
  const pbo = logits.filter((x) => x < 0).length / logits.length;
  const averageIs = mean(isPerformance);
  const averageOos = mean(oosPerformance);

  return {
    pbo,
    combinations: logits.length,
    probabilityOfLoss: oosLosses / logits.length,
    averageInSampleSharpe: averageIs,
    averageOutOfSampleSharpe: averageOos,
    averageDegradation: averageIs - averageOos
  };
}

function splitIntoBlocks(rows, blockCount) {
  const blocks = Array.from({ length: blockCount }, () => []);
  rows.forEach((row, idx) => {
    const blockIndex = Math.min(blockCount - 1, Math.floor(idx * blockCount / rows.length));
    blocks[blockIndex].push(row);
  });
  return blocks;
}

function sharpeFromBlocks(blocks, blockIndexes, strategyName) {
  const returns = [];
  for (const idx of blockIndexes) {
    for (const row of blocks[idx]) returns.push(row.values[strategyName]);
  }
  const sd = sampleStd(returns);
  return sd > 0 ? mean(returns) / sd : null;
}

function makeVerdict({ selected, pbo, validation, summary }) {
  if (validation.errors.length || !selected || selected.psr == null) {
    return {
      status: "Insufficient data",
      title: "Insufficient data",
      reason: "The dataset could not support a complete statistical audit."
    };
  }

  const observed = selected.observations || summary.rows;
  const minTrl = selected.minTrackRecordLength;
  const hasEnoughTrack = Number.isFinite(minTrl) ? observed >= minTrl : false;
  const psrOk = selected.psr >= 0.95;
  const dsrKnown = selected.dsr != null;
  const dsrOk = dsrKnown ? selected.dsr >= 0.95 : summary.strategyCount === 1;
  const pboKnown = pbo != null;
  const pboOk = pboKnown ? pbo.pbo <= 0.05 : summary.strategyCount === 1;

  if (pboKnown && pbo.pbo > 0.20) {
    return {
      status: "Likely overfit",
      title: "Selection process looks overfit",
      reason: `PBO is ${formatPercent(pbo.pbo)}, meaning the in-sample winner frequently falls below the median strategy out of sample.`
    };
  }

  if (psrOk && dsrOk && pboOk && hasEnoughTrack) {
    return {
      status: "Credible",
      title: "Backtest survives the main checks",
      reason: "The selected strategy has strong PSR evidence, passes available deflation checks, and has enough observed records for the Sharpe claim."
    };
  }

  if (!hasEnoughTrack) {
    return {
      status: "Fragile",
      title: "Track record is too short",
      reason: `The selected strategy has ${observed} observations, while the estimated minimum track record length is ${formatNumber(minTrl, 0)} observations.`
    };
  }

  if (!psrOk) {
    return {
      status: "Fragile",
      title: "Sharpe evidence is weak",
      reason: `PSR is ${formatPercent(selected.psr)}, below the 95% evidence threshold used by this report.`
    };
  }

  if (dsrKnown && !dsrOk) {
    return {
      status: "Fragile",
      title: "Sharpe deflates under multiple testing",
      reason: `DSR is ${formatPercent(selected.dsr)}, below the 95% threshold after considering tested strategy variants.`
    };
  }

  return {
    status: "Fragile",
    title: "Audit is incomplete or mixed",
    reason: "Some diagnostics passed, but at least one important credibility check is unavailable or below threshold."
  };
}

function psr(sharpe, observations, skewness, kurtosis, benchmarkSharpe = 0) {
  if (!Number.isFinite(sharpe) || observations < 2) return null;
  const denominatorTerm = 1 - skewness * sharpe + ((kurtosis - 1) / 4) * sharpe ** 2;
  if (denominatorTerm <= 0) return sharpe > benchmarkSharpe ? 1 : 0;
  const statistic = (sharpe - benchmarkSharpe) * Math.sqrt(observations - 1) / Math.sqrt(denominatorTerm);
  return normalCdf(statistic);
}

function minTrackRecordLength(sharpe, skewness, kurtosis, benchmarkSharpe = 0, alpha = 0.05) {
  if (!Number.isFinite(sharpe) || sharpe <= benchmarkSharpe) return Infinity;
  const denominatorTerm = 1 - skewness * sharpe + ((kurtosis - 1) / 4) * sharpe ** 2;
  const z = inverseNormal(1 - alpha);
  return denominatorTerm * (z / (sharpe - benchmarkSharpe)) ** 2;
}

function mean(xs) {
  const finite = xs.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, x) => sum + x, 0) / finite.length : null;
}

function sampleVariance(xs) {
  const finite = xs.filter(Number.isFinite);
  if (finite.length < 2) return 0;
  const avg = mean(finite);
  return finite.reduce((sum, x) => sum + (x - avg) ** 2, 0) / (finite.length - 1);
}

function sampleStd(xs) {
  return Math.sqrt(sampleVariance(xs));
}

function sampleSkewness(xs) {
  const finite = xs.filter(Number.isFinite);
  if (finite.length < 3) return 0;
  const avg = mean(finite);
  const sd = sampleStd(finite);
  if (sd === 0) return 0;
  const n = finite.length;
  const m3 = finite.reduce((sum, x) => sum + ((x - avg) / sd) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * m3;
}

function rawKurtosis(xs) {
  const finite = xs.filter(Number.isFinite);
  if (finite.length < 4) return 3;
  const avg = mean(finite);
  const sd = sampleStd(finite);
  if (sd === 0) return 3;
  const n = finite.length;
  const m4 = finite.reduce((sum, x) => sum + ((x - avg) / sd) ** 4, 0);
  const excess = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * m4
    - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  return excess + 3;
}

function cumulativeReturn(returns) {
  return returns.reduce((equity, r) => equity * (1 + r), 1) - 1;
}

function maxDrawdown(returns) {
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const r of returns) {
    equity *= (1 + r);
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity / peak - 1);
  }
  return maxDd;
}

function median(xs) {
  const finite = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
}

function combinations(items, k) {
  const result = [];
  const path = [];
  function walk(start) {
    if (path.length === k) {
      result.push([...path]);
      return;
    }
    for (let i = start; i <= items.length - (k - path.length); i++) {
      path.push(items[i]);
      walk(i + 1);
      path.pop();
    }
  }
  walk(0);
  return result;
}

function normalizeNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace("%", "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return value.includes("%") ? parsed / 100 : parsed;
}

function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function inverseNormal(p) {
  if (p <= 0 || p >= 1) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }

  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  if (p <= pHigh) {
    q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
      / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
    / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

export function formatPercent(value) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatNumber(value, digits = 2) {
  if (value == null) return "N/A";
  if (value === Infinity) return "∞";
  if (!Number.isFinite(value)) return "N/A";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

export function generateMarkdownReport(report) {
  const selected = report.selected;
  const pbo = report.pbo;
  return `# QuantCred Audit Report

Generated: ${report.generatedAt}

## Verdict

**${report.verdict.status}: ${report.verdict.title}**

${report.verdict.reason}

## Dataset

- Source: ${report.summary.label}
- Schema: ${report.summary.schemaMode}
- Observations: ${report.summary.rows}
- Strategies: ${report.summary.strategyCount}
- Selected strategy: ${selected.name}

## Diagnostics

| Diagnostic | Value |
|---|---:|
| Native Sharpe | ${formatNumber(selected.sharpe, 4)} |
| PSR vs zero | ${formatPercent(selected.psr)} |
| DSR | ${selected.dsr == null ? "N/A" : formatPercent(selected.dsr)} |
| DSR Sharpe hurdle | ${selected.dsrSharpeHurdle == null ? "N/A" : formatNumber(selected.dsrSharpeHurdle, 4)} |
| Minimum Track Record Length | ${formatNumber(selected.minTrackRecordLength, 0)} |
| Max Drawdown | ${formatPercent(selected.maxDrawdown)} |
| Skewness | ${formatNumber(selected.skewness, 4)} |
| Raw Kurtosis | ${formatNumber(selected.kurtosis, 4)} |
| PBO | ${pbo == null ? "N/A" : formatPercent(pbo.pbo)} |
| Probability of OOS Loss | ${pbo == null ? "N/A" : formatPercent(pbo.probabilityOfLoss)} |

## Validation Notes

${[...report.validation.errors, ...report.validation.warnings].map((item) => `- ${item}`).join("\n") || "- No validation warnings."}

## Method Summary

QuantCred is a statistical audit tool. It does not predict returns or recommend securities.
`;
}
