import { auditDataset, detectSchema, parseRecords, generateMarkdownReport, formatPercent, formatNumber } from "./math/audit.js";

const KENNETH_FRENCH_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html";
const APP_VERSION = "0.4.0";
const $ = (selector) => document.querySelector(selector);

const els = {
  fileInput: $("#fileInput"),
  sourceBtn: $("#loadDemoBtn"),
  dropZone: $("#dropZone"),
  validationList: $("#validationList"),
  schemaLabel: $("#schemaLabel"),
  reportBody: $("#reportBody"),
  metricGrid: $("#metricGrid"),
  verdictCard: $("#verdictCard"),
  verdictStatus: $("#verdictStatus"),
  verdictTitle: $("#verdictTitle"),
  verdictReason: $("#verdictReason"),
  reportTimestamp: $("#reportTimestamp"),
  exportBtn: $("#exportBtn"),
  barData: $("#barData"),
  barPsr: $("#barPsr"),
  barDsr: $("#barDsr"),
  barPbo: $("#barPbo"),
  sectionSearch: $("#sectionSearch")
};

let currentReport = null;

async function parseCsvText(text, label = "uploaded CSV", rawHash = null) {
  const prepared = prepareCsvText(text, label);
  const preparedHash = await sha256Text(prepared.text);

  Papa.parse(prepared.text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: async (result) => {
      const schema = detectSchema(result.data);
      const parsed = parseRecords(result.data, schema);
      const report = auditDataset(parsed, {
        label: prepared.label,
        schema,
        parseErrors: result.errors || [],
        preprocessingNotes: prepared.notes,
        provenance: {
          appVersion: APP_VERSION,
          commitSha: "runtime-static",
          buildTime: document.lastModified || new Date().toISOString(),
          inputHashes: {
            rawInput: rawHash || await sha256Text(text),
            preparedInput: preparedHash
          },
          metricVersions: {
            psr: "bailey-lopez-de-prado-2012",
            dsr: "bailey-lopez-de-prado-2014",
            pbo: "bailey-borwein-lopez-de-prado-zhu-2016",
            serialCorrelation: "acf-effective-sample-size-v1",
            duplicateStrategyAudit: "pairwise-correlation-cluster-v1",
            schemaRouter: "column-role-v1",
            signalPanel: "pit-leakage-ic-v1",
            executionAudit: "tca-v1"
          }
        }
      });
      currentReport = report;
      renderReport(report);
    },
    error: (error) => renderError(`CSV parsing failed: ${error.message}`)
  });
}

async function parseFile(file) {
  if (!file) return;
  try {
    const rawHash = await sha256File(file);
    if (file.name.toLowerCase().endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file);
      const csvEntry = Object.values(zip.files).find((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".csv"));
      if (!csvEntry) throw new Error("ZIP did not contain a CSV file.");
      await parseCsvText(await csvEntry.async("text"), `${file.name} → ${csvEntry.name}`, rawHash);
      return;
    }
    await parseCsvText(await file.text(), file.name, rawHash);
  } catch (error) {
    renderError(error.message);
  }
}

function prepareCsvText(text, label) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const french = prepareFrenchFactorCsv(normalized);
  if (french) {
    return {
      text: french,
      label,
      notes: ["Detected Kenneth French factor format. Header text was removed, percent returns were converted to decimal returns, and RF was excluded from strategy selection."]
    };
  }
  const cleaned = stripLeadingMetadata(normalized);
  return { text: cleaned, label, notes: cleaned === normalized ? [] : ["Leading metadata rows were removed before parsing."] };
}

function prepareFrenchFactorCsv(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => /^,?Mkt-RF,SMB,HML,RF$/i.test(line.replace(/\s+/g, "")));
  if (headerIndex === -1) return null;
  const output = ["date,mkt_rf,smb,hml"];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/^\d{8},/.test(line)) break;
    const parts = line.split(",").map((part) => part.trim());
    if (parts.length < 5) continue;
    const dateRaw = parts[0];
    const values = parts.slice(1, 4).map((value) => {
      const number = Number(value);
      return Number.isFinite(number) ? (number / 100).toString() : "";
    });
    output.push(`${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)},${values.join(",")}`);
  }
  return output.length > 1 ? output.join("\n") : null;
}

function stripLeadingMetadata(text) {
  const lines = text.split("\n");
  const headerIndex = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return lower.includes("date,") || lower.startsWith("date,") || lower.includes(",return") || lower.includes("strategy");
  });
  return headerIndex > 0 ? lines.slice(headerIndex).join("\n") : text;
}

function renderReport(report) {
  renderVerdict(report);
  renderBars(report);
  renderMetrics(report);
  renderValidation(report);
  renderReportBody(report);
  els.exportBtn.disabled = false;
  els.reportTimestamp.textContent = new Date(report.generatedAt).toLocaleString();
}

function renderVerdict(report) {
  const status = report.verdict.status;
  els.verdictStatus.textContent = status;
  els.verdictTitle.textContent = report.verdict.title;
  els.verdictReason.textContent = report.verdict.reason;
  const dot = els.verdictCard.querySelector(".status-dot");
  dot.style.background = status === "Credible" ? "var(--green)"
    : status === "Likely overfit" || status === "Audit blocked" || status === "Reject" ? "var(--red)"
    : status === "Research more" || status === "Insufficient data" ? "var(--amber)"
    : "var(--sand)";
}

function renderBars(report) {
  const blocked = report.verdict.status === "Audit blocked";
  const quality = blocked ? 5 : report.validation.errors.length ? 20 : Math.max(55, 100 - report.validation.warnings.length * 10);
  els.barData.style.setProperty("--w", `${clamp(quality, 5, 100)}%`);
  els.barPsr.style.setProperty("--w", `${clamp(Math.round((report.selected.psr ?? 0) * 100), 5, 100)}%`);
  els.barDsr.style.setProperty("--w", `${clamp(report.selected.dsr == null ? 8 : Math.round(report.selected.dsr * 100), 5, 100)}%`);
  els.barPbo.style.setProperty("--w", `${clamp(report.pbo == null ? 8 : Math.round((1 - report.pbo.pbo) * 100), 5, 100)}%`);
}

function renderMetrics(report) {
  if (report.verdict.status === "Audit blocked") {
    els.metricGrid.innerHTML = `
      ${metricCard("Schema gate", "Blocked", report.summary.schemaMode, "unsupported input", report.verdict.reason)}
      ${metricCard("Rows inspected", "No audit", report.summary.inputRows ?? 0, "input rows", "No statistical diagnostics were run.")}
      ${metricCard("Sharpe evidence", "Not run", "N/A", "blocked", "Schema must pass before PSR/DSR.")}
      ${metricCard("Overfit check", "Not run", "N/A", "blocked", "PBO requires raw date-indexed returns.")}
    `;
    return;
  }

  if (report.executionAudit) {
    els.metricGrid.innerHTML = `
      ${metricCard("Execution audit", report.executionAudit.bindingRule || "Computed", formatNumber(report.executionAudit.weightedNetAlpha5dBps, 2), "net alpha 5d bps", `${report.executionAudit.tradeCount} trades`)}
      ${metricCard("Shortfall", "TCA", formatNumber(report.executionAudit.weightedImplementationShortfallBps, 2), "bps", `P95 ${formatNumber(report.executionAudit.p95ShortfallBps, 2)} bps`)}
      ${metricCard("Participation", "Capacity", formatPercent(report.executionAudit.p95ParticipationRate), "p95 participation", `Total notional ${formatNumber(report.executionAudit.totalNotional, 0)}`)}
      ${metricCard("Sharpe evidence", "Not run", "N/A", "execution blotter", "Trade rows are not return streams.")}
    `;
    return;
  }

  if (report.signalPanelAudit) {
    els.metricGrid.innerHTML = `
      ${metricCard("PIT leakage", report.signalPanelAudit.bindingRule || "Checked", formatPercent(report.signalPanelAudit.leakage.leakageRate), "leakage rate", `${report.signalPanelAudit.leakage.leakedRows} leaked rows`)}
      ${metricCard("Best IC", "Signal", report.signalPanelAudit.bestIc ? formatNumber(report.signalPanelAudit.bestIc.meanIc, 4) : "N/A", "mean IC", report.signalPanelAudit.bestIc ? report.signalPanelAudit.bestIc.signal : "not available")}
      ${metricCard("Panel keys", "Cross-section", report.signalPanelAudit.duplicateKeyCount, "duplicate keys", "Duplicate dates are expected; asof_date+symbol is checked.")}
      ${metricCard("Sharpe evidence", "Not run", "N/A", "signal labels", "Future returns are labels, not strategies.")}
    `;
    return;
  }

  const selected = report.selected;
  const pbo = report.pbo;
  const serial = report.serialCorrelation;
  els.metricGrid.innerHTML = `
    ${metricCard("Data integrity", report.validation.errors.length ? "Blocked" : "Checked", report.summary.rows, "valid rows", `${report.summary.strategyCount} strategy column${report.summary.strategyCount === 1 ? "" : "s"} detected`)}
    ${metricCard("Sharpe evidence", formatPercent(selected.psr), formatNumber(selected.annualizedSharpe, 2), "annualized Sharpe", `Daily Sharpe ${formatNumber(selected.dailySharpe ?? selected.sharpe, 4)}`)}
    ${metricCard("Serial correlation", serial?.severity || "N/A", serial ? formatNumber(serial.lag1, 3) : "N/A", "lag-1 autocorr", serial ? `effective n ≈ ${formatNumber(serial.effectiveSampleSize, 0)}` : "not available")}
    ${metricCard("Overfit check", pbo == null ? "Unavailable" : formatPercent(pbo.pbo), pbo == null ? "N/A" : formatPercent(1 - pbo.pbo), "selection survival", pbo == null ? "Needs a strategy matrix" : `${pbo.combinations} CSCV splits evaluated`)}
  `;
}

function metricCard(title, badge, value, label, caption) {
  return `<article class="metric-card"><div class="metric-card__header"><span>${escapeHtml(title)}</span><em>${escapeHtml(badge)}</em></div><div class="metric-value">${escapeHtml(String(value))}</div><div class="metric-caption">${escapeHtml(label)}<br>${escapeHtml(caption)}</div></article>`;
}

function renderValidation(report) {
  els.schemaLabel.textContent = `${report.summary.schemaMode} · ${report.summary.rows} rows`;
  const items = [];
  report.validation.errors.forEach((message) => items.push({ kind: "error", message }));
  report.validation.warnings.forEach((message) => items.push({ kind: "warning", message }));
  (report.validation.notes || []).forEach((message) => items.push({ kind: "ok", message }));
  if (!items.length) items.push({ kind: "ok", message: "CSV passed structural validation." });
  if (report.selected?.name && report.selected.name !== "N/A") items.push({ kind: "ok", message: `Selected strategy for audit: ${report.selected.name}.` });
  els.validationList.innerHTML = items.map((item) => `<li class="${item.kind === "ok" ? "" : item.kind}">${escapeHtml(item.message)}</li>`).join("");
}

function renderReportBody(report) {
  if (report.verdict.status === "Audit blocked") {
    els.reportBody.innerHTML = `
      <div class="report-grid">
        <div class="report-mini"><small>Verdict</small><strong>Audit blocked</strong></div>
        <div class="report-mini"><small>Detected schema</small><strong>${escapeHtml(report.summary.schemaMode)}</strong></div>
        <div class="report-mini"><small>Input rows</small><strong>${report.summary.inputRows ?? 0}</strong></div>
      </div>
      <table class="report-table"><tbody>
        <tr><td>Reason</td><td colspan="2">${escapeHtml(report.verdict.reason)}</td></tr>
        <tr><td>Date parse rate</td><td>${formatPercent(report.schemaGate?.dateParseRate ?? 0)}</td><td>Must be at least 90% for a return audit.</td></tr>
        <tr><td>Raw input hash</td><td>${escapeHtml(shortHash(report.provenance?.inputHashes?.rawInput))}</td><td>SHA-256 of uploaded file.</td></tr>
        <tr><td>Prepared input hash</td><td>${escapeHtml(shortHash(report.provenance?.inputHashes?.preparedInput))}</td><td>SHA-256 after preprocessing.</td></tr>
      </tbody></table>
      <p class="muted">No Sharpe, PSR, DSR, PBO, or capital-readiness calculations were run because the file did not pass schema gating.</p>`;
    return;
  }

  if (report.executionAudit) {
    const a = report.executionAudit;
    els.reportBody.innerHTML = `<div class="report-grid"><div class="report-mini"><small>Schema</small><strong>execution_blotter</strong></div><div class="report-mini"><small>Trades</small><strong>${a.tradeCount}</strong></div><div class="report-mini"><small>Net alpha 5d</small><strong>${formatNumber(a.weightedNetAlpha5dBps, 2)} bps</strong></div></div><table class="report-table"><tbody><tr><td>Expected alpha</td><td>${formatNumber(a.weightedExpectedAlphaBps, 4)} bps</td><td>Notional-weighted</td></tr><tr><td>Realized alpha 5d</td><td>${formatNumber(a.weightedRealizedAlpha5dBps, 4)} bps</td><td>Notional-weighted</td></tr><tr><td>Implementation shortfall</td><td>${formatNumber(a.weightedImplementationShortfallBps, 4)} bps</td><td>Execution drag</td></tr><tr><td>Borrow drag 5d</td><td>${formatNumber(a.weightedBorrowDrag5dBps, 4)} bps</td><td>Estimated from borrow_bps_annual</td></tr><tr><td>P95 participation</td><td>${formatPercent(a.p95ParticipationRate)}</td><td>Capacity stress</td></tr><tr><td>Binding rule</td><td>${a.bindingRule || "N/A"}</td><td>Verdict cap</td></tr></tbody></table><p class="muted">${escapeHtml(report.verdict.reason)}</p>`;
    return;
  }

  if (report.signalPanelAudit) {
    const a = report.signalPanelAudit;
    els.reportBody.innerHTML = `<div class="report-grid"><div class="report-mini"><small>Schema</small><strong>point_in_time_signal_panel</strong></div><div class="report-mini"><small>Rows</small><strong>${a.rowCount}</strong></div><div class="report-mini"><small>Leakage rate</small><strong>${formatPercent(a.leakage.leakageRate)}</strong></div></div><table class="report-table"><tbody><tr><td>Signal columns</td><td>${escapeHtml(a.signalColumns.join(", "))}</td><td>Candidate signals</td></tr><tr><td>Label columns</td><td>${escapeHtml(a.labelColumns.join(", "))}</td><td>Forward returns; never selected as strategies</td></tr><tr><td>Leaked rows</td><td>${a.leakage.leakedRows}</td><td>Availability after as-of date or explicit flag</td></tr><tr><td>Duplicate key count</td><td>${a.duplicateKeyCount}</td><td>asof_date + symbol key</td></tr><tr><td>Best IC pair</td><td>${a.bestIc ? `${escapeHtml(a.bestIc.signal)} vs ${escapeHtml(a.bestIc.label)}` : "N/A"}</td><td>Cross-sectional Spearman IC</td></tr><tr><td>Binding rule</td><td>${a.bindingRule || "N/A"}</td><td>Verdict cap</td></tr></tbody></table><p class="muted">${escapeHtml(report.verdict.reason)}</p>`;
    return;
  }

  const s = report.selected;
  const pbo = report.pbo;
  const serial = report.serialCorrelation;
  const dup = report.duplicateStrategyAudit;
  els.reportBody.innerHTML = `
    <div class="report-grid">
      <div class="report-mini"><small>Verdict</small><strong>${escapeHtml(report.verdict.status)}</strong></div>
      <div class="report-mini"><small>Daily / annualized Sharpe</small><strong>${formatNumber(s.dailySharpe ?? s.sharpe, 3)} / ${formatNumber(s.annualizedSharpe, 2)}</strong></div>
      <div class="report-mini"><small>Observed / effective records</small><strong>${report.summary.rows} / ${serial ? formatNumber(serial.effectiveSampleSize, 0) : "N/A"}</strong></div>
    </div>
    <table class="report-table"><thead><tr><th>Diagnostic</th><th>Value</th><th>Interpretation</th></tr></thead><tbody>
      <tr><td>Selected column</td><td>${escapeHtml(s.name)}</td><td>The return stream used for headline statistics.</td></tr>
      <tr><td>Daily Sharpe</td><td>${formatNumber(s.dailySharpe ?? s.sharpe, 4)}</td><td>Mean return per unit of daily/native volatility.</td></tr>
      <tr><td>Annualized Sharpe</td><td>${formatNumber(s.annualizedSharpe, 4)}</td><td>Daily Sharpe multiplied by sqrt(252).</td></tr>
      <tr><td>Lag-1 autocorrelation</td><td>${serial ? formatNumber(serial.lag1, 4) : "N/A"}</td><td>${serial?.severity === "blocker" ? "Pathological smoothing/leakage blocker." : "Serial dependence diagnostic."}</td></tr>
      <tr><td>Effective observations</td><td>${serial ? formatNumber(serial.effectiveSampleSize, 0) : "N/A"}</td><td>Approximation n × (1-rho1)/(1+rho1).</td></tr>
      <tr><td>PSR vs zero</td><td>${formatPercent(s.psr)}</td><td>Probability Sharpe exceeds zero after sample-shape adjustment.</td></tr>
      <tr><td>DSR</td><td>${s.dsr == null ? "N/A" : formatPercent(s.dsr)}</td><td>${s.dsr == null ? "Requires multiple strategies or declared trial count." : "Sharpe evidence after multiple-testing deflation."}</td></tr>
      <tr><td>PBO</td><td>${pbo == null ? "N/A" : formatPercent(pbo.pbo)}</td><td>${pbo == null ? "Requires a strategy matrix." : `${pbo.combinations} CSCV splits; median OOS rank ${formatNumber(pbo.selectedStrategyMedianOosRank, 2)}.`}</td></tr>
      <tr><td>Max strategy correlation</td><td>${dup ? formatNumber(dup.maxCorrelation, 4) : "N/A"}</td><td>${dup?.maxPair ? `${escapeHtml(dup.maxPair[0])} vs ${escapeHtml(dup.maxPair[1])}` : "No pair available."}</td></tr>
      <tr><td>Correlation-adjusted clusters</td><td>${dup?.correlationClusterCount ?? "N/A"}</td><td>Nominal strategies: ${dup?.nominalStrategyCount ?? "N/A"}.</td></tr>
      <tr><td>Max drawdown</td><td>${formatPercent(s.maxDrawdown)}</td><td>Largest peak-to-trough equity decline.</td></tr>
      <tr><td>Raw input hash</td><td>${escapeHtml(shortHash(report.provenance?.inputHashes?.rawInput))}</td><td>SHA-256 of uploaded file.</td></tr>
    </tbody></table>
    <p class="muted">${escapeHtml(report.verdict.reason)}</p>`;
}

function exportCurrentReport() {
  if (!currentReport) return;
  const blob = new Blob([generateMarkdownReport(currentReport)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "quantcred-audit-report.md";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderError(message) {
  els.validationList.innerHTML = `<li class="error">${escapeHtml(message)}</li>`;
  els.schemaLabel.textContent = "Error";
  els.verdictStatus.textContent = "Error";
  els.verdictTitle.textContent = "Could not audit file";
  els.verdictReason.textContent = message;
}

async function sha256File(file) { return toHex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())); }
async function sha256Text(text) { return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))); }
function toHex(buffer) { return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function shortHash(hash) { return hash ? `${hash.slice(0, 12)}…${hash.slice(-8)}` : "N/A"; }
function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

els.fileInput.addEventListener("change", (event) => parseFile(event.target.files[0]));
els.sourceBtn.addEventListener("click", () => window.open(KENNETH_FRENCH_URL, "_blank", "noopener,noreferrer"));
els.sourceBtn.textContent = "Open official dataset page";
els.exportBtn.addEventListener("click", exportCurrentReport);
els.sectionSearch.addEventListener("input", (event) => {
  const q = event.target.value.trim().toLowerCase();
  document.querySelectorAll(".metric-card, .panel, .method-card, .hero-copy, .verdict-card").forEach((section) => {
    section.style.opacity = !q || section.textContent.toLowerCase().includes(q) ? "1" : "0.32";
  });
});
["dragenter", "dragover"].forEach((eventName) => els.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); els.dropZone.classList.add("drag-over"); }));
["dragleave", "drop"].forEach((eventName) => els.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); els.dropZone.classList.remove("drag-over"); }));
els.dropZone.addEventListener("drop", (event) => parseFile(event.dataTransfer.files?.[0]));
