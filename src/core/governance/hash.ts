export async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return sha256Bytes(bytes);
}

export async function sha256File(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return sha256Bytes(new Uint8Array(buffer));
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function stableHashJson(value: unknown): Promise<string> {
  return sha256Text(stableStringify(value));
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(",")}}`;
}
