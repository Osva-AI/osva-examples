const REDACTIONS: readonly [RegExp, string][] = [
  [/osva_ak_[A-Za-z0-9_-]+/g, "[REDACTED_OSVA_API_KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]"],
  [/(authorization\s*[:=]\s*)[^,\s}]+/gi, "$1[REDACTED]"],
];

export function redactSensitiveText(value: string): string {
  return REDACTIONS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return redactSensitiveText(error.message);
  if (typeof error === "string") return redactSensitiveText(error);
  return "Unknown error.";
}
