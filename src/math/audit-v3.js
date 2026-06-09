const PERIODS_PER_YEAR = 252;
const SUMMARY_COLUMNS = new Set([
  "full_obs",
  "full_sharpe",
  "full_ann_return",
  "full_ann_vol",
  "full_max_drawdown",
  "full_skew",
  "full_kurtosis",
  "full_autocorr1",
  "pre2020_sharpe",
  "post2020_sharpe",
  "post2023_sharpe"
]);
const PBO_SUMMARY_COLUMNS = new Set([
  "cscv_partitions",
  "cscv_splits",
  "pbo_worse_than_median",
  "median_oos_rank",
  "mean_degradation_sharpe_points",
  "lambda_median",
  "most_common_selected"
]);

export function detectSchema(rows) {
  const sample = rows.find((row) => row && Object.keys(row).some((key) => row[key] !== null && row[key] !== ""));
  if (!sample) return blockedSchema("empty", "No rows were found.", []);

  const columns = Object.keys(sample).map((key) => key.trim()).filter(Boolean);
  const lowerColumns = columns.map((column) => column.toLowerCase());
  const firstColumn = columns[0];
  const explicitDate = columns.find((column) => column.toLowerCase() === "date") || columns.find((column) => column.toLowerCase().includes("date"));
  const dateColumn = explicitDate || firstColumn;
  const dateRate = parseDateRate(rows, dateColumn);

  if (lowerColumns.some((column) => SUMMARY_COLUMNS.has(column))) {
    return blockedSchema("metrics_summary", "File contains metric-summary columns, not raw return observations.", columns, dateColumn, dateRate);
  }

  if (lowerColumns.some((column) => PBO_SUMMARY_COLUMNS.has(column))) {
    return blockedSchema("pbo_summary", "File contains PBO-summary columns, not raw return observations.", columns, dateColumn, dateRate);
  }

  const lower = new Set(lowerColumns);
  if (["symbol", "side", "quantity", "price"].every((column) => lower.has(column))) {
    return blockedSchema("trades", "Trades/orders were recognized, but this browser audit path requires derived return series before statistical audit.", columns, dateColumn, dateRate);
  }

  if (["symbol", "weight"].every((column) => lower.has(column))) {
    return blockedSchema("positions", "Positions/holdings were recognized, but this browser audit path requires derived return series before statistical audit.", columns, dateColumn, dateRate);
  }

  if (dateRate < 0.9) {
    return blockedSchema("unsupported", "First/date column is not date-like in at least 90% of rows. Upload a date-indexed return stream or strategy matrix.", columns, dateColumn, dateRate);
  }

  const returnColumn = columns.find((column) => column.toLowerCase() === "return");
  const ignored = new Set([dateColumn, "strategy_id", "symbol", "side", "quantity", "price", "fees", "borrow_cost", "spread_bps", "adv", "notional", "sector", "country", "market_cap"]);
  const numericColumns = columns.filter((column) => !ignored.has(column) && numericRate(rows, column) >= 0.9);

  if (returnColumn && numericRate(rows, returnColumn) >= 0.9) {
    return auditSchema("single", dateColumn, [returnColumn], columns, dateRate);
  }

  if (numericColumns.length >= 2) {
    return auditSchema(factorLike(numericColumns) ? "factor_returns" : "matrix", dateColumn, numericColumns, columns, dateRate);
  }

  if (numericColumns.length === 1) return auditSchema("single", dateColumn, numericColumns, columns, dateRate);

  return blockedSchema("unsupported", "No return-like numeric strategy columns were found.", columns, dateColumn, dateRate);
}

export function parseRecords(rows, schema) {
  if (schema.canAudit === false) {
    return { observations: [], strategyNames: [], sourceRowCount: rows.length, schema };
  }

  const observations = [];
  const strategyNames = schema.returnColumns || [];

  for (const row of rows) {
    if (!row || !schema.dateColumn) continue;
    const rawDate = row[schema.dateColumn];
    const date = parseDate(rawDate);
    const values = {};
    let hasNumber = false;

    for (const name of strategyNames) {
      const value = normalizeNumber(row[name]);
      values[name] = value;
      if (Number.isFinite(value)) hasNumber = true;
    }

    if (hasNumber) observations.push({ date, rawDate, values });
  }

  observations.sort((a, b) => (a.date ? a.date.getTime() : Number.MAX_SAFE_INTEGER) - (b.date ? b.date.getTime() : Number.MAX_SAFE_INTEGER));
  return { observations, strategyNames, sourceRowCount: rows.length, schema };
}

export function auditDataset(parsed, meta = {}) {
  const schema = parsed.schema || meta.schema || {};
  const validation = validate(parsed, meta, schema);
  const strategySeries = buildStrategySeries(parsed);
  const summary = {
    label: meta.label || "dataset",
    schemaMode: schema.mode || meta.schema?.mode || "unknown",
    inputRows: parsed.sourceRowCount ?? parsed.observations.length,
    rows: parsed.observations.length,
    strategyCount: strategySeries.length,
    dateStart: parsed.observations.find((row) => row.date)?.date?.toISOString().slice(0, 10) || null,
    dateEnd: [...parsed.observations].reverse().find((row) => row.date)?.date?.toISOString().slice(0, 10) || null,
    frequency: "daily",
    periodsPerYear: PERIODS_PER_YEAR
  };

  if (schema.canAudit === false) return blockedReport(summary, validation, meta, schema);
  if (strategySeries.length === 0 || parsed.observations.length < 2) return emptyReport(summary, validation, meta);

  const strategyMetrics = strategySeries.map((series) => ({ name: series.name, returns: series.returns, ...computeSeriesMetrics(series.returns) }));
  const selected = selectStrategy(strategyMetrics, meta.selectedStrategy);
  const allScores = strategyMetrics.map((item) => item.dailySharpe).filter(Number.isFinite);
  const deflation = allScores.length > 1 ? computeDsr(selected.returns, allScores) : { dsr: null, hurdle: null, effectiveTrials: 1 };
  const selectedWithDeflation = { ...selected, dsr: deflation.dsr, dsrSharpeHurdle: deflation.hurdle, effectiveTrials: deflation.effectiveTrials };
  const pbo = strategySeries.length >= 3 && parsed.observations.length >= 32 ? computePbo(parsed, 8) : null;
  const duplicateAudit = duplicateStrategyAudit(parsed);
  const serialCorrelation = serialCorrelationAudit(selected.name, selected.returns);
  const integrityChecks = integrityAudit(parsed, strategyMetrics, serialCorrelation, duplicateAudit);
  const score = scoreReport({ selected: selectedWithDeflation, pbo, validation, integrityChecks, serialCorrelation, duplicateAudit });
  const verdict = makeVerdict({ selected: selectedWithDeflation, pbo, validation, summary, score, serialCorrelation, duplicateAudit, integrityChecks });

  return {
    generatedAt: new Date().toISOString(),
    version: "0.3.0",
    summary,
    validation,
    provenance: meta.provenance || null,
    selected: selectedWithDeflation,
    strategies: strategyMetrics.map(({ returns, ...rest }) => rest),
    pbo,
    serialCorrelation,
    duplicateStrategyAudit: duplicateAudit,
    dataIntegrity: integrityChecks,
    score,
    verdict
  };
}

function auditSchema(mode, dateColumn, returnColumns, columns, dateRate) {
  return { mode, dateColumn, returnColumns, columns, dateParseRate: dateRate, canAudit: true, reason: null, errors: [], warnings: [] };
}

function blockedSchema(mode, reason, columns, dateColumn = null, dateRate = 0) {
  return { mode, dateColumn, returnColumns: [], columns, dateParseRate: dateRate, canAudit: false, reason, errors: [reason], warnings: [] };
}

function blockedReport(summary, validation, meta, schema) {
  return {
    generatedAt: new Date().toISOString(),
    version: "0.3.0",
    summary,
    validation,
    provenance: meta.provenance || null,
    schemaGate: schema,
    selected: emptySelected(),
    strategies: [],
    pbo: null,
    serialCorrelation: null,
    duplicateStrategyAudit: null,
    dataIntegrity: [],
    score: emptyScore("audit_blocked", [schema.reason || "Unsupported schema."]),
    verdict: { status: "Audit blocked", title: "Unsupported input schema", reason: schema.reason || "This file cannot be audited as raw returns." }
  };
}

function emptyReport(summary, validation, meta) {
  return {
    generatedAt: new Date().toISOString(),
    version: "0.3.0",
    summary,
    validation,
    provenance: meta.provenance || null,
    selected: emptySelected(),
    strategies: [],
    pbo: null,
    serialCorrelation: null,
    duplicateStrategyAudit: null,
    dataIntegrity: [],
    score: emptyScore("reject", ["No auditable return series supplied."]),
    verdict: { status: "Insufficient data", title: "Insufficient data", reason: "The file does not contain enough valid numeric return observations to run an audit." }
  };
}

function emptySelected() {
  return { name: "N/A", dailySharpe: null, annualizedSharpe: null, sharpe: null, psr: null, dsr: null, minTrackRecordLength: null, maxDrawdown: null, skewness: null, kurtosis: null };
}

function validate(parsed, meta, schema) {
  const errors = [];
  const warnings = [];
  const notes = [...(meta.preprocessingNotes || [])];

  if (schema.canAudit === false) errors.push(schema.reason || "Unsupported input schema.");
  if (meta.parseErrors?.length) warnings.push(`${meta.parseErrors.length} CSV parsing warning(s) were reported by the parser.`);
  if (schema.canAudit === false) return { errors, warnings, notes };

  if (!parsed.observations.length) errors.push("No valid observations were found.");
  if (!parsed.strategyNames.length) errors.push("No return columns were detected. Use date,return or date,strategy_a,strategy_b,...");

  const invalidDates = parsed.observations.filter((row) => !row.date).length;
  if (invalidDates) errors.push(`${invalidDates} row(s) have invalid or missing dates. Audit cannot continue with an invalid date index.`);

  const duplicates = countDuplicateDates(parsed.observations);
  if (duplicates > 0) warnings.push(`${duplicates} duplicate date(s) detected. Duplicate rows can distort statistics.`);
  if (parsed.observations.length < 30) warnings.push("Fewer than 30 observations. Statistical diagnostics may be unstable.");

  const allReturns = parsed.observations.flatMap((row) => parsed.strategyNames.map((name) => row.values[name]).filter(Number.isFinite));
  if (allReturns.length && median(allReturns.map(Math.abs)) > 1) warnings.push("Median absolute return is greater than 1. Values may be percentages rather than decimal returns.");
  if (allReturns.some((value) => value <= -1)) errors.push("At least one return is less than or equal to -100%, which is not a valid simple return.");

  const missingCount = parsed.observations.reduce((count, row) => count + parsed.strategyNames.filter((name) => !Number.isFinite(row.values[name])).length, 0);
  if (missingCount) warnings.push(`${missingCount} missing/non-numeric return cell(s) were ignored.`);
  return { errors, warnings, notes };
}

function integrityAudit(parsed, strategyMetrics, serialCorrelation, duplicateAudit) {
  const checks = [];
  const dates = parsed.observations.map((row) => row.date).filter(Boolean);
  checks.push({ id: "date_order", severity: "warning", status: isStrictlyIncreasing(dates) ? "pass" : "fail", message: "Dates should be strictly increasing after parsing." });
  checks.push({ id: "duplicate_dates", severity: "warning", status: countDuplicateDates(parsed.observations) === 0 ? "pass" : "fail", message: "Duplicate dates can overweight observations." });
  checks.push({ id: "return_floor", severity: "critical", status: hasImpossibleReturn(parsed) ? "fail" : "pass", message: "Simple returns must be greater than -100%." });
  checks.push({ id: "constant_returns", severity: "critical", status: strategyMetrics.some((metric) => metric.volatility === 0) ? "fail" : "pass", message: "Zero-volatility return streams are not auditable as risky strategies." });
  checks.push({ id: "selected_serial_correlation", severity: serialCorrelation.severity === "blocker" ? "critical" : serialCorrelation.severity === "critical" ? "critical" : "warning", status: serialCorrelation.severity === "pass" ? "pass" : "fail", message: `Selected strategy lag-1 autocorrelation is ${formatNumber(serialCorrelation.lag1, 4)}; effective sample size is ${formatNumber(serialCorrelation.effectiveSampleSize, 0)}.` });
  checks.push({ id: "matrix_correlation", severity: duplicateAudit.maxCorrelation > 0.999 ? "critical" : "warning", status: duplicateAudit.maxCorrelation > 0.99 ? "fail" : "pass", message: duplicateAudit.maxPair ? `Max pairwise strategy correlation is ${formatNumber(duplicateAudit.maxCorrelation, 4)} between ${duplicateAudit.maxPair[0]} and ${duplicateAudit.maxPair[1]}.` : "No near-identical strategy columns detected." });
  return checks;
}

function serialCorrelationAudit(selectedStrategy, returns) {
  const lag1 = autocorrelation(returns, 1);
  const lag2 = autocorrelation(returns, 2);
  const lag5 = autocorrelation(returns, 5);
  const effectiveSampleSize = Number.isFinite(lag1) && lag1 < 1 ? returns.length * (1 - lag1) / (1 + lag1) : returns.length;
  const severity = lag1 > 0.9 ? "blocker" : lag1 > 0.7 ? "critical" : lag1 > 0.3 ? "warning" : "pass";
  return { selectedStrategy, lag1, lag2, lag5, effectiveSampleSize, sharpeInflationWarning: lag1 > 0.3, severity };
}

function duplicateStrategyAudit(parsed) {
  const names = parsed.strategyNames;
  const duplicatePairs = [];
  let maxCorrelation = 0;
  let maxPair = null;

  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const x = parsed.observations.map((row) => row.values[names[i]]);
      const y = parsed.observations.map((row) => row.values[names[j]]);
      const rho = Math.abs(correlation(x, y));
      if (Number.isFinite(rho) && rho > maxCorrelation) {
        maxCorrelation = rho;
        maxPair = [names[i], names[j]];
      }
      if (rho > 0.99) duplicatePairs.push({ strategyA: names[i], strategyB: names[j], correlation: rho, severity: rho > 0.999 ? "critical" : "warning" });
    }
  }

  return { maxCorrelation, maxPair, duplicatePairs, nominalStrategyCount: names.length, correlationClusterCount: clusterCount(parsed, 0.99), nearDuplicateClusterCount: duplicatePairs.length };
}

function clusterCount(parsed, threshold) {
  const names = parsed.strategyNames;
  const parent = names.map((_, index) => index);
  const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a, b) => { const pa = find(a); const pb = find(b); if (pa !== pb) parent[pb] = pa; };

  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const x = parsed.observations.map((row) => row.values[names[i]]);
      const y = parsed.observations.map((row) => row.values[names[j]]);
      if (Math.abs(correlation(x, y)) >= threshold) union(i, j);
    }
  }
  return new Set(names.map((_, index) => find(index))).size;
}

function buildStrategySeries(parsed) {
  return parsed.strategyNames.map((name) => ({ name, returns: parsed.observations.map((row) => row.values[name]).filter((value) => Number.isFinite(value) && value > -1) })).filter((series) => series.returns.length >= 2);
}

function selectStrategy(strategyMetrics, selectedName) {
  if (selectedName) {
    const selected = strategyMetrics.find((item) => item.name === selectedName);
    if (selected) return selected;
  }
  return [...strategyMetrics].sort((a, b) => numericSortDesc(a.dailySharpe, b.dailySharpe))[0];
}

function computeSeriesMetrics(returns) {
  const avg = mean(returns);
  const sd = sampleStd(returns);
  const dailySharpe = sd > 0 ? avg / sd : null;
  const skew = sampleSkewness(returns);
  const kurt = rawKurtosis(returns);
  const psrValue = dailySharpe == null ? null : psr(dailySharpe, returns.length, skew, kurt, 0);
  const minTrl = dailySharpe == null ? null : minTrackRecordLength(dailySharpe, skew, kurt, 0, 0.05);
  return { observations: returns.length, mean: avg, volatility: sd, dailySharpe, annualizedSharpe: dailySharpe == null ? null : dailySharpe * Math.sqrt(PERIODS_PER_YEAR), sharpe: dailySharpe, skewness: skew, kurtosis: kurt, psr: psrValue, minTrackRecordLength: minTrl, maxDrawdown: maxDrawdown(returns), cumulativeReturn: cumulativeReturn(returns), hitRate: returns.filter((value) => value > 0).length / returns.length };
}

function computeDsr(selectedReturns, trialSharpes) {
  const selectedMetrics = computeSeriesMetrics(selectedReturns);
  const finiteScores = trialSharpes.filter(Number.isFinite);
  const n = finiteScores.length;
  if (n <= 1 || selectedMetrics.dailySharpe == null) return { dsr: null, hurdle: null, effectiveTrials: n };
  const std = Math.sqrt(Math.max(sampleVariance(finiteScores), 0));
  const gamma = 0.5772156649015329;
  const hurdle = std * ((1 - gamma) * inverseNormal(1 - 1 / n) + gamma * inverseNormal(1 - 1 / (Math.E * n)));
  return { dsr: psr(selectedMetrics.dailySharpe, selectedReturns.length, selectedMetrics.skewness, selectedMetrics.kurtosis, hurdle), hurdle, effectiveTrials: n };
}

function computePbo(parsed, blockCount = 8) {
  const rows = parsed.observations.filter((row) => row.date && parsed.strategyNames.every((name) => Number.isFinite(row.values[name])));
  const names = parsed.strategyNames;
  if (rows.length < blockCount || names.length < 3) return null;
  const blocks = splitIntoBlocks(rows, blockCount);
  const combos = combinations([...Array(blockCount).keys()], blockCount / 2);
  const logitValues = [];
  const inSampleRanks = [];
  const outOfSampleRanks = [];
  const isPerf = [];
  const oosPerf = [];
  const selectedCounts = new Map();
  let losses = 0;

  for (const trainBlocks of combos) {
    const trainSet = new Set(trainBlocks);
    const testBlocks = [...Array(blockCount).keys()].filter((idx) => !trainSet.has(idx));
    const train = names.map((name) => ({ name, score: scoreFromBlocks(blocks, trainBlocks, name) })).filter((item) => Number.isFinite(item.score));
    const selected = [...train].sort((a, b) => numericSortDesc(a.score, b.score))[0];
    const test = names.map((name) => ({ name, score: scoreFromBlocks(blocks, testBlocks, name) })).filter((item) => Number.isFinite(item.score));
    const selectedTest = test.find((item) => item.name === selected?.name);
    if (!selected || !selectedTest) continue;
    selectedCounts.set(selected.name, (selectedCounts.get(selected.name) || 0) + 1);
    const sortedTest = [...test].sort((a, b) => b.score - a.score);
    const rank = sortedTest.findIndex((item) => item.name === selected.name) + 1;
    const w = (sortedTest.length - rank + 1) / (sortedTest.length + 1);
    logitValues.push(Math.log(w / (1 - w)));
    inSampleRanks.push(1);
    outOfSampleRanks.push(rank);
    isPerf.push(selected.score);
    oosPerf.push(selectedTest.score);
    if (selectedTest.score < 0) losses += 1;
  }

  if (!logitValues.length) return null;
  return {
    pbo: logitValues.filter((value) => value < 0).length / logitValues.length,
    combinations: logitValues.length,
    partitions: blockCount,
    selectionMetric: "daily_sharpe",
    rankConvention: "rank 1 is best out-of-sample",
    logitValues,
    lambdaMedian: median(logitValues),
    inSampleRanks,
    outOfSampleRanks,
    probabilityOfLoss: losses / logitValues.length,
    degradation: mean(isPerf) - mean(oosPerf),
    selectedStrategyMedianOosRank: median(outOfSampleRanks),
    mostCommonSelected: [...selectedCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([strategy, count]) => ({ strategy, count }))
  };
}

function scoreReport({ selected, pbo, validation, integrityChecks, serialCorrelation, duplicateAudit }) {
  const criticalFailures = integrityChecks.filter((check) => check.severity === "critical" && check.status !== "pass");
  const components = {
    statisticalCredibility: boundedScore(selected.psr),
    multipleTestingControl: selected.dsr == null ? 35 : boundedScore(selected.dsr),
    robustness: pbo == null ? 35 : boundedScore(1 - pbo.pbo),
    costCapacity: 0,
    factorIndependence: 0,
    dataIntegrity: integrityChecks.filter((check) => check.status === "pass").length / Math.max(1, integrityChecks.length) * 100,
    liveIncubation: 0
  };
  const total = components.statisticalCredibility * 0.2 + components.multipleTestingControl * 0.2 + components.robustness * 0.15 + components.costCapacity * 0.15 + components.factorIndependence * 0.1 + components.dataIntegrity * 0.1 + components.liveIncubation * 0.1;
  const overrides = [];
  if (validation.errors.length) overrides.push("Validation errors block capital-readiness.");
  if (serialCorrelation?.severity === "blocker") overrides.push("Selected strategy has pathological autocorrelation; PSR/DSR are likely overstated.");
  if (duplicateAudit?.maxCorrelation > 0.999) overrides.push("Critical strategy clone detected; multiple-testing independence assumption is invalid.");
  if (criticalFailures.length) overrides.push("Critical data-integrity failures block a credible verdict.");
  if (pbo && pbo.pbo > 0.5) overrides.push("PBO above 0.5 indicates likely selection overfitting.");
  if (selected.dsr != null && selected.dsr < 0.95) overrides.push("DSR below 95% caps decision at research_more.");
  const decision = overrides.length ? "research_more" : total >= 80 ? "incubate" : total >= 55 ? "research_more" : "reject";
  return { total, components, decision, overrides };
}

function makeVerdict({ selected, pbo, validation, summary, score, serialCorrelation, duplicateAudit, integrityChecks }) {
  if (validation.errors.length || !selected || selected.psr == null) return { status: "Audit blocked", title: "Audit blocked by validation", reason: validation.errors.join(" ") || "The dataset could not support a complete statistical audit." };
  const observed = selected.observations || summary.rows;
  const enoughTrack = Number.isFinite(selected.minTrackRecordLength) ? observed >= selected.minTrackRecordLength : false;
  const criticalFailures = integrityChecks.filter((check) => check.severity === "critical" && check.status !== "pass");
  if (serialCorrelation?.severity === "blocker" || duplicateAudit?.maxCorrelation > 0.999 || criticalFailures.length) {
    return { status: "Research more", title: "Data-integrity blocker", reason: score.overrides.join(" ") || "Integrity failures must dominate PSR, DSR, and PBO." };
  }
  if (pbo && pbo.pbo > 0.5) return { status: "Likely overfit", title: "Selection process looks overfit", reason: `PBO is ${formatPercent(pbo.pbo)}, meaning the selected in-sample winner often ranks poorly out of sample.` };
  if (score.overrides.length) return { status: "Research more", title: "Audit has unresolved blockers", reason: score.overrides.join(" ") };
  if (selected.psr >= 0.95 && (selected.dsr == null || selected.dsr >= 0.95) && enoughTrack) return { status: "Credible", title: "Backtest survives the available statistical checks", reason: "The selected stream passes available statistical checks. Capital-readiness still requires cost, leakage, factor, and live-incubation review." };
  return { status: "Fragile", title: "Audit is incomplete or mixed", reason: `Observed records: ${observed}; estimated minimum track record length: ${formatNumber(selected.minTrackRecordLength, 0)}.` };
}

function factorLike(columns) {
  const names = new Set(["mkt", "mkt_rf", "smb", "hml", "umd", "mom", "momentum", "quality", "low_vol", "value", "size"]);
  return columns.filter((column) => names.has(column.toLowerCase().replace(/[- ]/g, "_"))).length >= 2;
}
function parseDateRate(rows, column) { if (!column) return 0; const values = rows.map((row) => row[column]).filter((value) => value !== undefined && value !== null && value !== ""); if (!values.length) return 0; return values.filter((value) => parseDate(value)).length / values.length; }
function numericRate(rows, column) { const values = rows.map((row) => row[column]).filter((value) => value !== undefined && value !== null && value !== ""); if (!values.length) return 0; return values.filter((value) => Number.isFinite(normalizeNumber(value))).length / values.length; }
function parseDate(value) { if (value instanceof Date && !Number.isNaN(value.getTime())) return value; const text = String(value ?? "").trim(); if (/^\d{8}$/.test(text)) return new Date(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8)))); const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? null : parsed; }
function countDuplicateDates(rows) { const seen = new Set(); let duplicates = 0; for (const row of rows) { if (!row.date) continue; const key = row.date.toISOString().slice(0, 10); if (seen.has(key)) duplicates += 1; seen.add(key); } return duplicates; }
function isStrictlyIncreasing(dates) { return dates.every((date, index) => index === 0 || date.getTime() > dates[index - 1].getTime()); }
function hasImpossibleReturn(parsed) { return parsed.observations.some((row) => parsed.strategyNames.some((name) => Number.isFinite(row.values[name]) && row.values[name] <= -1)); }
function splitIntoBlocks(rows, blockCount) { const blocks = Array.from({ length: blockCount }, () => []); rows.forEach((row, idx) => blocks[Math.min(blockCount - 1, Math.floor(idx * blockCount / rows.length))].push(row)); return blocks; }
function scoreFromBlocks(blocks, indexes, name) { const returns = indexes.flatMap((idx) => blocks[idx].map((row) => row.values[name])); const sd = sampleStd(returns); return sd > 0 ? mean(returns) / sd : null; }
function combinations(items, k) { const out = []; const path = []; const walk = (start) => { if (path.length === k) return out.push([...path]); for (let i = start; i <= items.length - (k - path.length); i += 1) { path.push(items[i]); walk(i + 1); path.pop(); } }; walk(0); return out; }
function normalizeNumber(value) { if (typeof value === "number") return Number.isFinite(value) ? value : null; if (typeof value !== "string") return null; const text = value.trim().replace(/%$/, "").replace(/,/g, ""); if (!text) return null; const number = Number(text); if (!Number.isFinite(number)) return null; return value.trim().endsWith("%") ? number / 100 : number; }
function mean(xs) { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; }
function sampleVariance(xs) { const v = xs.filter(Number.isFinite); if (v.length < 2) return 0; const m = mean(v); return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1); }
function sampleStd(xs) { return Math.sqrt(sampleVariance(xs)); }
function sampleSkewness(xs) { const v = xs.filter(Number.isFinite); if (v.length < 3) return 0; const m = mean(v), sd = sampleStd(v); if (sd === 0) return 0; return (v.length / ((v.length - 1) * (v.length - 2))) * v.reduce((s, x) => s + ((x - m) / sd) ** 3, 0); }
function rawKurtosis(xs) { const v = xs.filter(Number.isFinite); if (v.length < 4) return 3; const m = mean(v), sd = sampleStd(v); if (sd === 0) return 3; const n = v.length; const moment4 = v.reduce((s, x) => s + ((x - m) / sd) ** 4, 0); return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * moment4 - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)) + 3; }
function correlation(x, y) { const pairs = x.map((a, i) => [a, y[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)); if (pairs.length < 2) return 0; const vx = pairs.map(([a]) => a); const vy = pairs.map(([, b]) => b); const mx = mean(vx), my = mean(vy), sx = sampleStd(vx), sy = sampleStd(vy); return sx > 0 && sy > 0 ? pairs.reduce((s, [a, b]) => s + (a - mx) * (b - my), 0) / ((pairs.length - 1) * sx * sy) : 0; }
function autocorrelation(values, lag) { const v = values.filter(Number.isFinite); if (v.length <= lag + 1) return 0; return correlation(v.slice(lag), v.slice(0, -lag)); }
function median(xs) { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null; const mid = Math.floor(v.length / 2); return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2; }
function cumulativeReturn(returns) { return returns.reduce((equity, r) => equity * (1 + r), 1) - 1; }
function maxDrawdown(returns) { let equity = 1, peak = 1, maxDd = 0; for (const r of returns) { equity *= 1 + r; peak = Math.max(peak, equity); maxDd = Math.min(maxDd, equity / peak - 1); } return maxDd; }
function boundedScore(value) { return Number.isFinite(value) ? Math.max(0, Math.min(100, value * 100)) : 0; }
function psr(sharpe, observations, skewness, kurtosis, benchmark = 0) { const den = 1 - skewness * sharpe + ((kurtosis - 1) / 4) * sharpe ** 2; if (den <= 0) return sharpe > benchmark ? 1 : 0; return normalCdf((sharpe - benchmark) * Math.sqrt(observations - 1) / Math.sqrt(den)); }
function minTrackRecordLength(sharpe, skewness, kurtosis, benchmark = 0, alpha = 0.05) { if (sharpe <= benchmark) return Infinity; return (1 - skewness * sharpe + ((kurtosis - 1) / 4) * sharpe ** 2) * (inverseNormal(1 - alpha) / (sharpe - benchmark)) ** 2; }
function normalCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
function erf(x) { const sign = x >= 0 ? 1 : -1, ax = Math.abs(x), p = 0.3275911, t = 1 / (1 + p * ax); const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax)); return sign * y; }
function inverseNormal(p) { if (p <= 0 || p >= 1) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN; const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416], pl = 0.02425, ph = 1 - pl; let q; if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); } if (p <= ph) { q = p - 0.5; const r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); } q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
function numericSortDesc(a, b) { if (!Number.isFinite(a) && !Number.isFinite(b)) return 0; if (!Number.isFinite(a)) return 1; if (!Number.isFinite(b)) return -1; return b - a; }
function emptyScore(decision, overrides) { return { total: 0, components: { statisticalCredibility: 0, multipleTestingControl: 0, robustness: 0, costCapacity: 0, factorIndependence: 0, dataIntegrity: 0, liveIncubation: 0 }, decision, overrides }; }
export function formatPercent(value) { if (value == null || !Number.isFinite(value)) return "N/A"; return `${(value * 100).toFixed(1)}%`; }
export function formatNumber(value, digits = 2) { if (value == null) return "N/A"; if (value === Infinity) return "∞"; if (!Number.isFinite(value)) return "N/A"; return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }); }

export function generateMarkdownReport(report) {
  if (report.verdict?.status === "Audit blocked") return blockedMarkdown(report);
  const selected = report.selected;
  const pbo = report.pbo;
  const serial = report.serialCorrelation;
  const dup = report.duplicateStrategyAudit;
  return `# QuantCred Audit Report\n\nGenerated: ${report.generatedAt}\n\n## Verdict\n\n**${report.verdict.status}: ${report.verdict.title}**\n\n${report.verdict.reason}\n\n## Dataset\n\n- Source: ${report.summary.label}\n- Schema: ${report.summary.schemaMode}\n- Observations: ${report.summary.rows}\n- Strategies: ${report.summary.strategyCount}\n- Selected strategy: ${selected.name}\n- Date range: ${report.summary.dateStart || "N/A"} to ${report.summary.dateEnd || "N/A"}\n- Frequency assumption: daily\n- Annualization factor: sqrt(${PERIODS_PER_YEAR})\n\n## Provenance\n\n- Raw input hash: ${report.provenance?.inputHashes?.rawInput || "N/A"}\n- Prepared input hash: ${report.provenance?.inputHashes?.preparedInput || "N/A"}\n- App version: ${report.provenance?.appVersion || report.version || "N/A"}\n\n## Diagnostics\n\n| Diagnostic | Value |\n|---|---:|\n| Daily Sharpe | ${formatNumber(selected.dailySharpe ?? selected.sharpe, 4)} |\n| Annualized Sharpe | ${formatNumber(selected.annualizedSharpe, 4)} |\n| PSR vs zero | ${formatPercent(selected.psr)} |\n| DSR | ${selected.dsr == null ? "N/A" : formatPercent(selected.dsr)} |\n| DSR Sharpe hurdle | ${selected.dsrSharpeHurdle == null ? "N/A" : formatNumber(selected.dsrSharpeHurdle, 4)} |\n| Minimum Track Record Length | ${formatNumber(selected.minTrackRecordLength, 0)} |\n| Max Drawdown | ${formatPercent(selected.maxDrawdown)} |\n| Skewness | ${formatNumber(selected.skewness, 4)} |\n| Raw Kurtosis | ${formatNumber(selected.kurtosis, 4)} |\n| PBO | ${pbo == null ? "N/A" : formatPercent(pbo.pbo)} |\n| Probability of OOS Loss | ${pbo == null ? "N/A" : formatPercent(pbo.probabilityOfLoss)} |\n| Capital-readiness decision | ${report.score?.decision || "N/A"} |\n\n## Serial Correlation\n\n| Diagnostic | Value |\n|---|---:|\n| Lag-1 autocorrelation | ${serial ? formatNumber(serial.lag1, 4) : "N/A"} |\n| Lag-2 autocorrelation | ${serial ? formatNumber(serial.lag2, 4) : "N/A"} |\n| Lag-5 autocorrelation | ${serial ? formatNumber(serial.lag5, 4) : "N/A"} |\n| Effective independent observations | ${serial ? formatNumber(serial.effectiveSampleSize, 0) : "N/A"} |\n| Severity | ${serial?.severity || "N/A"} |\n\n## Duplicate Strategy Audit\n\n- Nominal strategies: ${dup?.nominalStrategyCount ?? "N/A"}\n- Correlation-adjusted clusters at 0.99: ${dup?.correlationClusterCount ?? "N/A"}\n- Max pairwise correlation: ${dup ? formatNumber(dup.maxCorrelation, 4) : "N/A"}\n- Max pair: ${dup?.maxPair ? `${dup.maxPair[0]} vs ${dup.maxPair[1]}` : "N/A"}\n\n${duplicatePairsMarkdown(dup)}\n\n## PBO Method Metadata\n\n- CSCV partitions: ${pbo?.partitions ?? "N/A"}\n- CSCV split count: ${pbo?.combinations ?? "N/A"}\n- Selection metric: ${pbo?.selectionMetric ?? "N/A"}\n- Rank convention: ${pbo?.rankConvention ?? "N/A"}\n- Median OOS rank: ${pbo?.selectedStrategyMedianOosRank == null ? "N/A" : formatNumber(pbo.selectedStrategyMedianOosRank, 2)}\n- Mean Sharpe degradation: ${pbo?.degradation == null ? "N/A" : formatNumber(pbo.degradation, 4)}\n- Lambda median: ${pbo?.lambdaMedian == null ? "N/A" : formatNumber(pbo.lambdaMedian, 4)}\n\n## Validation Notes\n\n${[...(report.validation.errors || []), ...(report.validation.warnings || []), ...(report.validation.notes || [])].map((item) => `- ${item}`).join("\n") || "- No validation warnings."}\n\n## Data Integrity Checks\n\n${(report.dataIntegrity || []).map((check) => `- ${check.status.toUpperCase()} [${check.severity}] ${check.id}: ${check.message}`).join("\n") || "- No data integrity checks were run."}\n`; }

function blockedMarkdown(report) {
  return `# QuantCred Audit Report\n\nGenerated: ${report.generatedAt}\n\n## Verdict\n\n**Audit blocked: Unsupported input schema**\n\n${report.verdict.reason}\n\n## Dataset\n\n- Source: ${report.summary.label}\n- Schema: ${report.summary.schemaMode}\n- Input rows: ${report.summary.inputRows}\n- Audited observations: 0\n\n## Schema Gate\n\n- Can audit: false\n- Reason: ${report.schemaGate?.reason || report.verdict.reason}\n- Date parse rate: ${formatPercent(report.schemaGate?.dateParseRate ?? 0)}\n\n## Provenance\n\n- Raw input hash: ${report.provenance?.inputHashes?.rawInput || "N/A"}\n- Prepared input hash: ${report.provenance?.inputHashes?.preparedInput || "N/A"}\n- App version: ${report.provenance?.appVersion || report.version || "N/A"}\n\nNo Sharpe, PSR, DSR, PBO, or capital-readiness calculations were run because the file did not pass schema gating.\n`;
}

function duplicatePairsMarkdown(dup) {
  if (!dup?.duplicatePairs?.length) return "Near-duplicate strategy pairs: none detected.";
  return `Near-duplicate strategy pairs:\n\n${dup.duplicatePairs.slice(0, 10).map((pair, index) => `${index + 1}. ${pair.strategyA} vs ${pair.strategyB} — correlation ${formatNumber(pair.correlation, 4)} — severity ${pair.severity}`).join("\n")}`;
}
