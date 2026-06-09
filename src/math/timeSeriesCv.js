export function computeTimeSeriesCv(observations, config = {}) {
  const rows = observations.filter((row) => row.date);
  const folds = Math.max(2, Number(config.folds || 5));
  const leftGap = Math.max(0, Number(config.leftGapDays || config.holdingPeriodDays || 0));
  const rightGap = Math.max(0, Number(config.rightGapDays || 0));
  if (rows.length < folds) return { status: "insufficient_data", folds, leftGap, rightGap, foldSummaries: [] };
  const foldSummaries = [];
  for (let i = 0; i < folds; i += 1) {
    const start = Math.floor((rows.length * i) / folds);
    const end = Math.floor((rows.length * (i + 1)) / folds) - 1;
    const leftDate = addDays(rows[start].date, -leftGap);
    const rightDate = addDays(rows[end].date, rightGap);
    let removed = 0;
    let trainRows = 0;
    rows.forEach((row, index) => {
      const inTest = index >= start && index <= end;
      const removedByRule = !inTest && row.date >= leftDate && row.date <= rightDate;
      if (removedByRule) removed += 1;
      if (!inTest && !removedByRule) trainRows += 1;
    });
    foldSummaries.push({ fold: i + 1, testRows: end - start + 1, trainRows, removedRows: removed, testStart: iso(rows[start].date), testEnd: iso(rows[end].date) });
  }
  return { status: leftGap > 0 || rightGap > 0 ? "controlled" : "not_configured", folds, leftGap, rightGap, foldSummaries };
}

function addDays(date, days) {
  const output = new Date(date);
  output.setUTCDate(output.getUTCDate() + days);
  return output;
}
function iso(date) { return date.toISOString().slice(0, 10); }
