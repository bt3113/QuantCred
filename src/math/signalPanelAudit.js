export function detectSignalPanel(columns) {
  const names = new Set(columns.map((column) => String(column).toLowerCase()));
  return names.has("asof_date") && names.has("symbol") && [...names].some((name) => name.startsWith("signal_")) && [...names].some((name) => name.startsWith("future_return_"));
}

export function auditSignalPanel(rows, schema = {}) {
  const signalColumns = schema.signalColumns?.length ? schema.signalColumns : columnsOf(rows).filter((column) => column.toLowerCase().startsWith("signal_"));
  const labelColumns = schema.labelColumns?.length ? schema.labelColumns : columnsOf(rows).filter((column) => column.toLowerCase().startsWith("future_return_"));
  const keyDuplicates = countDuplicateKeys(rows, ["asof_date", "symbol"]);
  const leakage = leakageSummary(rows);
  const informationCoefficients = [];
  const quantileSpreads = [];

  for (const signal of signalColumns) {
    for (const label of labelColumns) {
      const byDate = groupBy(rows, "asof_date");
      const dateResults = [];
      const spreadResults = [];
      for (const [date, dateRows] of byDate.entries()) {
        const pairs = dateRows.map((row) => [number(row[signal]), number(row[label])]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
        if (pairs.length >= 10) {
          dateResults.push({ date, value: spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1])) });
          spreadResults.push({ date, value: topBottomSpread(pairs) });
        }
      }
      informationCoefficients.push({ signal, label, observations: dateResults.length, meanIc: mean(dateResults.map((item) => item.value)), icTStat: tStat(dateResults.map((item) => item.value)) });
      quantileSpreads.push({ signal, label, observations: spreadResults.length, meanTopBottomReturn: mean(spreadResults.map((item) => item.value)) });
    }
  }

  const bestIc = [...informationCoefficients].sort((a, b) => Math.abs(b.meanIc || 0) - Math.abs(a.meanIc || 0))[0] || null;
  const bindingRule = leakage.leakageRate > 0 ? "point_in_time_leakage" : null;
  return { status: "computed", rowCount: rows.length, signalColumns, labelColumns, duplicateAsOfDatesExpected: true, duplicateKeyCount: keyDuplicates, leakage, informationCoefficients, quantileSpreads, bestIc, bindingRule };
}

function leakageSummary(rows) {
  let flagged = 0;
  let availabilityAfterAsOf = 0;
  let checked = 0;
  for (const row of rows) {
    const explicit = number(row.leakage_flag_available_after_asof);
    if (explicit === 1) flagged += 1;
    const asof = parseDate(row.asof_date);
    const available = parseDate(row.earnings_available_date);
    if (asof && available) {
      checked += 1;
      if (available > asof) availabilityAfterAsOf += 1;
    }
  }
  const count = Math.max(flagged, availabilityAfterAsOf);
  return { leakedRows: count, checkedRows: rows.length, availabilityDateChecks: checked, leakageRate: rows.length ? count / rows.length : 0 };
}

function topBottomSpread(pairs) {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const n = Math.max(1, Math.floor(sorted.length / 5));
  const bottom = sorted.slice(0, n).map((p) => p[1]);
  const top = sorted.slice(-n).map((p) => p[1]);
  return mean(top) - mean(bottom);
}

function spearman(a, b) { return pearson(rank(a), rank(b)); }
function rank(values) { const sorted = values.map((value, index) => ({ value, index })).sort((x, y) => x.value - y.value); const ranks = Array(values.length); sorted.forEach((item, index) => { ranks[item.index] = index + 1; }); return ranks; }
function pearson(a, b) { const ma = mean(a); const mb = mean(b); const sa = std(a); const sb = std(b); if (!Number.isFinite(sa) || !Number.isFinite(sb) || sa <= 0 || sb <= 0) return Number.NaN; return a.reduce((sum, value, index) => sum + (value - ma) * (b[index] - mb), 0) / ((a.length - 1) * sa * sb); }
function tStat(values) { const finite = values.filter(Number.isFinite); const s = std(finite); return finite.length > 1 && s > 0 ? mean(finite) / (s / Math.sqrt(finite.length)) : Number.NaN; }
function countDuplicateKeys(rows, keys) { const seen = new Set(); let dupes = 0; rows.forEach((row) => { const key = keys.map((k) => row[k]).join("|"); if (seen.has(key)) dupes += 1; seen.add(key); }); return dupes; }
function groupBy(rows, column) { const out = new Map(); rows.forEach((row) => { const key = String(row[column] ?? ""); if (!out.has(key)) out.set(key, []); out.get(key).push(row); }); return out; }
function columnsOf(rows) { const sample = rows.find((row) => row && Object.keys(row).length); return sample ? Object.keys(sample) : []; }
function number(value) { if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN; const parsed = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : Number.NaN; }
function parseDate(value) { if (!value || String(value) === "NaN") return null; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? null : date; }
function mean(values) { const finite = values.filter(Number.isFinite); return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : Number.NaN; }
function std(values) { const finite = values.filter(Number.isFinite); if (finite.length < 2) return Number.NaN; const avg = mean(finite); return Math.sqrt(finite.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (finite.length - 1)); }
