import {
  auditDataset,
  detectSchema,
  parseRecords,
  generateMarkdownReport,
  formatPercent,
  formatNumber
} from "./math/audit.js";

const els = {
  fileInput: document.querySelector("#fileInput"),
  loadDemoBtn: document.querySelector("#loadDemoBtn"),
  dropZone: document.querySelector("#dropZone"),
  validationList: document.querySelector("#validationList"),
  schemaLabel: document.querySelector("#schemaLabel"),
  reportBody: document.querySelector("#reportBody"),
  metricGrid: document.querySelector("#metricGrid"),
  verdictCard: document.querySelector("#verdictCard"),
  verdictStatus: document.querySelector("#verdictStatus"),
  verdictTitle: document.querySelector("#verdictTitle"),
  verdictReason: document.querySelector("#verdictReason"),
  reportTimestamp: document.querySelector("#reportTimestamp"),
  exportBtn: document.querySelector("#exportBtn"),
  barData: document.querySelector("#barData"),
  barPsr: document.querySelector("#barPsr"),
  barDsr: document.querySelector("#barDsr"),
  barPbo: document.querySelector("#barPbo"),
  sectionSearch: document.querySelector("#sectionSearch")
};

let currentReport = null;

function parseCsvText(text, label = "uploaded CSV") {
  Papa.parse(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: (result) => {
      const schema = detectSchema(result.data);
      const parsed = parseRecords(result.data, schema);
      const report = auditDataset(parsed, { label, schema, parseErrors: result.errors || [] });
      currentReport = report;
      renderReport(report);
    },
    error: (error) => {
      renderError(`CSV parsing failed: ${error.message}`);
    }
  });
}

function parseFile(file) {
  if (!file) return;
  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    worker: true,
    complete: (result) => {
      const schema = detectSchema(result.data);
      const parsed = parseRecords(result.data, schema);
      const report = auditDataset(parsed, {
        label: file.name,
        schema,
        parseErrors: result.errors || []
      });
      currentReport = report;
      renderReport(report);
    },
    error: (error) => {
      renderError(`CSV parsing failed: ${error.message}`);
    }
  });
}

async function loadDemo() {
  try {
    const response = await fetch("./assets/sample_strategy_matrix.csv", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load demo dataset.");
    const text = await response.text();
    parseCsvText(text, "sample_strategy_matrix.csv");
  } catch (error) {
    renderError(error.message);
  }
}

function renderError(message) {
  els.validationList.innerHTML = `<li class="error">${escapeHtml(message)}</li>`;
  els.schemaLabel.textContent = "Error";
  els.verdictStatus.textContent = "Error";
  els.verdictTitle.textContent = "Could not audit file";
  els.verdictReason.textContent = message;
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
    : status === "Likely overfit" ? "var(--red)"
    : status === "Insufficient data" ? "var(--amber)"
    : "var(--sand)";
}

function renderBars(report) {
  const quality = report.validation.errors.length ? 32 : Math.max(55, 100 - report.validation.warnings.length * 10);
  const psr = Math.round((report.selected.psr ?? 0) * 100);
  const dsr = report.selected.dsr == null ? 18 : Math.round(report.selected.dsr * 100);
  const pbo = report.pbo == null ? 18 : Math.round((1 - report.pbo.pbo) * 100);

  els.barData.style.setProperty("--w", `${clamp(quality, 8, 100)}%`);
  els.barPsr.style.setProperty("--w", `${clamp(psr, 8, 100)}%`);
  els.barDsr.style.setProperty("--w", `${clamp(dsr, 8, 100)}%`);
  els.barPbo.style.setProperty("--w", `${clamp(pbo, 8, 100)}%`);
}

function renderMetrics(report) {
  const selected = report.selected;
  const pbo = report.pbo;
  const dsrLabel = selected.dsr == null ? "Unavailable" : formatPercent(selected.dsr);
  const pboLabel = pbo == null ? "Unavailable" : formatPercent(pbo.pbo);

  els.metricGrid.innerHTML = `
    ${metricCard("Data integrity", report.validation.errors.length ? "Blocked" : "Passed", report.summary.rows, "valid rows", `${report.summary.strategyCount} strategy column${report.summary.strategyCount === 1 ? "" : "s"} detected`)}
    ${metricCard("Sharpe evidence", formatPercent(selected.psr), formatNumber(selected.sharpe, 3), "native Sharpe", `Skew ${formatNumber(selected.skewness, 2)} · raw kurtosis ${formatNumber(selected.kurtosis, 2)}`)}
    ${metricCard("Deflation", dsrLabel, selected.dsr == null ? "N/A" : formatNumber(selected.dsrSharpeHurdle, 3), "DSR hurdle", selected.dsr == null ? "Needs multiple trials or manual trial disclosure" : `${report.summary.strategyCount} candidate strategies considered`)}
    ${metricCard("Overfit check", pboLabel, pbo == null ? "N/A" : formatPercent(1 - pbo.pbo), "selection survival", pbo == null ? "Needs a strategy matrix" : `${pbo.combinations} CSCV splits evaluated`)}
  `;
}

function metricCard(title, badge, value, label, caption) {
  return `
    <article class="metric-card">
      <div class="metric-card__header">
        <span>${escapeHtml(title)}</span>
        <em>${escapeHtml(badge)}</em>
      </div>
      <div class="metric-value">${escapeHtml(String(value))}</div>
      <div class="metric-caption">${escapeHtml(label)}<br>${escapeHtml(caption)}</div>
    </article>
  `;
}

function renderValidation(report) {
  els.schemaLabel.textContent = `${report.summary.schemaMode} · ${report.summary.rows} rows`;
  const items = [];

  report.validation.errors.forEach((message) => items.push({ kind: "error", message }));
  report.validation.warnings.forEach((message) => items.push({ kind: "warning", message }));

  if (!items.length) {
    items.push({ kind: "ok", message: "CSV passed structural validation." });
  }

  items.push({ kind: "ok", message: `Selected strategy for audit: ${report.selected.name}.` });

  els.validationList.innerHTML = items
    .map((item) => `<li class="${item.kind === "ok" ? "" : item.kind}">${escapeHtml(item.message)}</li>`)
    .join("");
}

function renderReportBody(report) {
  const selected = report.selected;
  const pbo = report.pbo;

  els.reportBody.innerHTML = `
    <div class="report-grid">
      <div class="report-mini"><small>Verdict</small><strong>${escapeHtml(report.verdict.status)}</strong></div>
      <div class="report-mini"><small>Minimum track record</small><strong>${formatNumber(selected.minTrackRecordLength, 0)}</strong></div>
      <div class="report-mini"><small>Observed records</small><strong>${report.summary.rows}</strong></div>
    </div>

    <table class="report-table">
      <thead>
        <tr><th>Diagnostic</th><th>Value</th><th>Interpretation</th></tr>
      </thead>
      <tbody>
        <tr><td>Native Sharpe</td><td>${formatNumber(selected.sharpe, 4)}</td><td>Mean excess return per unit of native-frequency volatility.</td></tr>
        <tr><td>PSR vs zero</td><td>${formatPercent(selected.psr)}</td><td>Probability Sharpe exceeds the benchmark after sample-shape adjustment.</td></tr>
        <tr><td>DSR</td><td>${selected.dsr == null ? "N/A" : formatPercent(selected.dsr)}</td><td>${selected.dsr == null ? "Requires multiple strategies or declared trial count." : "Sharpe evidence after multiple-testing deflation."}</td></tr>
        <tr><td>PBO</td><td>${pbo == null ? "N/A" : formatPercent(pbo.pbo)}</td><td>${pbo == null ? "Requires a strategy matrix." : "Estimated probability the selected in-sample winner underperforms the median strategy out of sample."}</td></tr>
        <tr><td>Max drawdown</td><td>${formatPercent(selected.maxDrawdown)}</td><td>Largest peak-to-trough equity decline in the uploaded return stream.</td></tr>
        <tr><td>Probability of OOS loss</td><td>${pbo == null ? "N/A" : formatPercent(pbo.probabilityOfLoss)}</td><td>${pbo == null ? "Requires CSCV splits." : "Fraction of selected-strategy OOS folds with negative performance."}</td></tr>
      </tbody>
    </table>

    <p class="muted">${escapeHtml(report.verdict.reason)}</p>
  `;
}

function exportCurrentReport() {
  if (!currentReport) return;
  const markdown = generateMarkdownReport(currentReport);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "quantcred-audit-report.md";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function handleSearch(event) {
  const q = event.target.value.trim().toLowerCase();
  const sections = document.querySelectorAll(".metric-card, .panel, .method-card, .hero-copy, .verdict-card");
  sections.forEach((section) => {
    const hit = !q || section.textContent.toLowerCase().includes(q);
    section.style.opacity = hit ? "1" : "0.32";
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

els.fileInput.addEventListener("change", (event) => parseFile(event.target.files[0]));
els.loadDemoBtn.addEventListener("click", loadDemo);
els.exportBtn.addEventListener("click", exportCurrentReport);
els.sectionSearch.addEventListener("input", handleSearch);

["dragenter", "dragover"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("drag-over");
  });
});

els.dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files?.[0];
  parseFile(file);
});
