#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { auditDataset, detectSchema, parseRecords, generateMarkdownReport } from "../src/math/audit.js";

const args = parseArgs(process.argv.slice(2));
if (!args.input || args.help) {
  console.log(`Usage: node scripts/quantcred-cli.mjs --input file.csv [--out report.md] [--json report.json] [--folds 5] [--left-gap-days 0] [--right-gap-days 0] [--manifest manifest.json] [--trial-ledger ledger.json]`);
  process.exit(args.help ? 0 : 1);
}

const csvText = readFileSync(args.input, "utf8");
const rows = parseCsv(csvText);
const manifest = args.manifest ? JSON.parse(readFileSync(args.manifest, "utf8")) : null;
const trialLedger = args.trialLedger ? JSON.parse(readFileSync(args.trialLedger, "utf8")) : [];
const schema = detectSchema(rows);
const parsed = parseRecords(rows, schema);
const report = auditDataset(parsed, {
  label: args.input,
  schema,
  parseErrors: [],
  preprocessingNotes: [],
  validationConfig: {
    folds: Number(args.folds || 5),
    leftGapDays: Number(args.leftGapDays || 0),
    rightGapDays: Number(args.rightGapDays || 0)
  },
  manifest,
  trialLedger,
  provenance: {
    appVersion: "cli",
    commitSha: "local",
    buildTime: new Date().toISOString(),
    inputHashes: { rawInput: sha256(csvText), preparedInput: sha256(csvText) },
    metricVersions: { pbo: "cscv", psr: "sample-shape", dsr: "multiple-testing" }
  }
});

const markdown = generateMarkdownReport(report);
if (args.out) writeFileSync(args.out, markdown);
else console.log(markdown);
if (args.json) writeFileSync(args.json, JSON.stringify(report, null, 2));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help" || key === "-h") out.help = true;
    else if (key.startsWith("--")) {
      const name = key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[name] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => Object.fromEntries(splitCsvLine(line).map((value, index) => [headers[index], value.trim()])));
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { current += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(current); current = ""; }
    else current += char;
  }
  values.push(current);
  return values;
}

function sha256(text) { return createHash("sha256").update(text).digest("hex"); }
