import type { IncidentWorkerInput, IncidentWorkerRequest } from "./types.js";

export const DEFAULT_INCIDENT_SERVICE = "checkout-api";
export const DEFAULT_ALERT_TYPE = "error-rate";
export const DEFAULT_INCIDENT_MESSAGE = "checkout-api error rate above 20% after deployment";

export function validateIncidentWorkerInput(raw: unknown): IncidentWorkerInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Incident worker input must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const incidentId = readRequiredString(record["incidentId"], "incidentId", 8, 128);
  const alertType = readRequiredString(record["alertType"], "alertType", 2, 80);
  const service = readRequiredString(record["service"], "service", 2, 80);
  const message = readRequiredString(record["message"], "message", 8, 500);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(service)) {
    throw new Error("service must use lowercase letters, numbers, and hyphens.");
  }
  return { incidentId, alertType, service, message };
}

export function buildIncidentWorkerRequest(input: IncidentWorkerInput): IncidentWorkerRequest {
  return { ...input };
}

function readRequiredString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new Error(`${field} must be between ${min} and ${max} characters.`);
  }
  return trimmed;
}
