import type { ProductWorkerInput, ProductWorkerRequest } from "./types.js";

export const DEFAULT_PRODUCT_ID = "flowtask-pro";
export const DEFAULT_PRODUCT_OBJECTIVE = "Improve activation for new users";

export function validateProductWorkerInput(raw: unknown): ProductWorkerInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Product worker input must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const productId = readRequiredString(record["productId"], "productId");
  if (productId.length < 2 || productId.length > 80) {
    throw new Error("productId must be between 2 and 80 characters.");
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(productId)) {
    throw new Error("productId must use lowercase letters, numbers, and hyphens.");
  }

  const objectiveRaw = record["objective"];
  let objective: string | undefined;
  if (objectiveRaw !== undefined && objectiveRaw !== null) {
    if (typeof objectiveRaw !== "string") {
      throw new Error("objective must be a string when provided.");
    }
    const trimmed = objectiveRaw.trim();
    if (trimmed.length > 200) {
      throw new Error("objective must be at most 200 characters.");
    }
    if (trimmed.length > 0) {
      objective = trimmed;
    }
  }

  const contextRaw = record["context"];
  let context: string | undefined;
  if (contextRaw !== undefined && contextRaw !== null) {
    if (typeof contextRaw !== "string") {
      throw new Error("context must be a string when provided.");
    }
    const trimmed = contextRaw.trim();
    if (trimmed.length > 500) {
      throw new Error("context must be at most 500 characters.");
    }
    if (trimmed.length > 0) {
      context = trimmed;
    }
  }

  return {
    productId,
    ...(objective === undefined ? {} : { objective }),
    ...(context === undefined ? {} : { context }),
  };
}

export function buildProductWorkerRequest(input: ProductWorkerInput, briefId: string): ProductWorkerRequest {
  return { briefId, ...input };
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${field} must not be empty.`);
  }
  return trimmed;
}
