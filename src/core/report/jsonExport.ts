import { stableHashJson } from "../governance/hash";

export async function exportJsonReport(report: Record<string, unknown>, pretty = true): Promise<string> {
  const digest = await stableHashJson(report);
  const enriched = {
    ...report,
    provenance: {
      ...(typeof report.provenance === "object" && report.provenance !== null ? report.provenance : {}),
      reportHash: digest
    }
  };
  return JSON.stringify(enriched, null, pretty ? 2 : 0);
}
