export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderHtmlReport(report: Record<string, unknown>): string {
  const title = get(report, "verdict.title") ?? "QuantCred Audit Report";
  const status = get(report, "verdict.status") ?? "unknown";
  const reason = get(report, "verdict.reason") ?? "";
  const selected = get(report, "selected.name") ?? "N/A";
  const rows = get(report, "summary.rows") ?? "N/A";
  const hash = get(report, "provenance.inputHashes.rawInput") ?? "N/A";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #ddd; padding: .5rem; text-align: left; }
  </style>
</head>
<body>
  <h1>QuantCred Audit Report</h1>
  <p><strong>Status:</strong> ${escapeHtml(status)}</p>
  <p>${escapeHtml(reason)}</p>
  <table>
    <tbody>
      <tr><th>Selected stream</th><td>${escapeHtml(selected)}</td></tr>
      <tr><th>Observed records</th><td>${escapeHtml(rows)}</td></tr>
      <tr><th>Raw input hash</th><td>${escapeHtml(hash)}</td></tr>
    </tbody>
  </table>
</body>
</html>`;
}

function get(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) return (value as Record<string, unknown>)[key];
    return undefined;
  }, source);
}
