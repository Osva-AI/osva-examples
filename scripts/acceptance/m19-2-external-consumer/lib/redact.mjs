const API_KEY_PATTERN = /osva_ak_[A-Za-z0-9._-]+/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~-]+/gi;

export function redactSecrets(text) {
  return String(text).replace(API_KEY_PATTERN, "osva_ak_[REDACTED]").replace(BEARER_PATTERN, "Bearer [REDACTED]");
}

export function redactReportValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return redactSecrets(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactReportValue(entry));
  }
  if (typeof value === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/api[_-]?key|authorization|secret|password|token/i.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactReportValue(nested);
      }
    }
    return out;
  }
  return value;
}
