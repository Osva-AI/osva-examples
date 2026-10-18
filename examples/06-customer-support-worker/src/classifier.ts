import type { SupportIntent } from "./types.js";

/**
 * Deterministic keyword classifier for demo support intents.
 * Production integrations would swap this for model-backed classification with human review.
 */
export function classifySupportIntent(message: string): SupportIntent {
  const normalized = message.trim().toLowerCase();
  if (normalized.length === 0) {
    return "unknown";
  }

  if (/\b(refund|money back|charge back|reimburse)\b/.test(normalized)) {
    return "refund-request";
  }
  if (/\b(cancel|cancellation|stop my order)\b/.test(normalized)) {
    return "cancel-order";
  }
  if (/\b(late|delayed|hasn't arrived|has not arrived|still waiting)\b/.test(normalized)) {
    return "shipment-delay";
  }
  if (/\b(status|where is|track|tracking|shipment|shipping update)\b/.test(normalized)) {
    return "order-status";
  }
  return "unknown";
}
