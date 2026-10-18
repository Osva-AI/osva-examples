import type { SupportWorkerInput, SupportWorkerRequest } from "./types.js";

const MIN_CUSTOMER_ID_LENGTH = 3;
const MAX_CUSTOMER_ID_LENGTH = 64;
const MIN_MESSAGE_LENGTH = 5;
const MAX_MESSAGE_LENGTH = 2000;

export const DEFAULT_CUSTOMER_ID = "cust-demo-001";
export const DEFAULT_SUPPORT_MESSAGE = "My order is already late. I want a refund.";

export function validateSupportWorkerInput(raw: unknown): SupportWorkerInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Support worker input must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const customerId = readBoundedString(
    record["customerId"],
    "customerId",
    MIN_CUSTOMER_ID_LENGTH,
    MAX_CUSTOMER_ID_LENGTH,
  );
  const message = readBoundedString(record["message"], "message", MIN_MESSAGE_LENGTH, MAX_MESSAGE_LENGTH);
  return { customerId, message };
}

export function buildSupportWorkerRequest(input: SupportWorkerInput, ticketId: string): SupportWorkerRequest {
  return { ticketId, ...input };
}

function readBoundedString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new Error(`${field} must be at least ${min} characters.`);
  }
  if (trimmed.length > max) {
    throw new Error(`${field} must be at most ${max} characters.`);
  }
  return trimmed;
}
