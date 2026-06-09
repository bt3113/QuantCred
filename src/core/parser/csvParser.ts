import { detectInputSchema, type SchemaDetectionResult } from "./schemaDetector";

export interface ParsedCsv {
  rows: Array<Record<string, string>>;
  columns: string[];
  schema: SchemaDetectionResult;
  errors: string[];
}

export function parseCsv(text: string): ParsedCsv {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return { rows: [], columns: [], schema: detectInputSchema([]), errors: ["CSV is empty."] };
  }

  const columns = splitCsvLine(lines[0]).map((column) => column.trim());
  const rows: Array<Record<string, string>> = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    if (values.length !== columns.length) {
      errors.push(`Line ${i + 1} has ${values.length} fields; expected ${columns.length}.`);
      continue;
    }
    rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index].trim()])));
  }

  return { rows, columns, schema: detectInputSchema(rows), errors };
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}
