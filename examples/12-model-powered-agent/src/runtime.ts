import type { JsonObject, JsonValue, ModelProfileVersionId } from "@osva-ai/contracts";
import type { GenerateTextOptions } from "@osva-ai/sdk/runtime";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

export const MODEL_BINDING = "classifier_model";

export const MODEL_SYSTEM_PROMPT =
  "Classify the user question into exactly one category: billing, product, support, or other. " +
  'Reply with JSON only: {"category":"<one of billing|product|support|other>"}.';

export interface ModelAgentInput {
  readonly question: string;
  readonly maxOutputTokens?: number;
}

export interface ModelAgentOutput {
  readonly question: string;
  readonly category: "billing" | "product" | "support" | "other";
  readonly modelText: string;
  readonly binding: typeof MODEL_BINDING;
}

export function parseModelAgentInput(input: JsonValue): ModelAgentInput {
  if (!isJsonRecord(input)) {
    throw new Error("Run input must be an object with a string 'question' property.");
  }
  const question = input["question"];
  if (typeof question !== "string" || question.trim().length === 0) {
    throw new Error("Run input must include a non-empty string 'question' property.");
  }
  const maxOutputTokens = input["maxOutputTokens"];
  if (maxOutputTokens === undefined) {
    return { question: question.trim() };
  }
  if (typeof maxOutputTokens !== "number" || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) {
    throw new Error("Optional 'maxOutputTokens' must be a positive integer when provided.");
  }
  return { question: question.trim(), maxOutputTokens };
}

export function buildGenerateTextOptions(request: ModelAgentInput): GenerateTextOptions {
  return {
    binding: MODEL_BINDING,
    messages: [
      { role: "system", content: MODEL_SYSTEM_PROMPT },
      { role: "user", content: request.question },
    ],
    ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }),
  };
}

const CATEGORY_VALUES = new Set(["billing", "product", "support", "other"]);

export function parseModelAgentOutput(question: string, modelText: string): ModelAgentOutput {
  const trimmed = modelText.trim();
  if (trimmed.length === 0) {
    throw new Error("Model returned empty text.");
  }

  let categoryRaw: unknown;
  try {
    const parsed = JSON.parse(trimmed) as JsonValue;
    if (!isJsonRecord(parsed) || typeof parsed["category"] !== "string") {
      throw new Error("Model JSON must include a string 'category' field.");
    }
    categoryRaw = parsed["category"];
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Model JSON")) {
      throw error;
    }
    throw new Error("Model response was not valid classification JSON.");
  }

  const category = String(categoryRaw).trim().toLowerCase();
  if (!CATEGORY_VALUES.has(category)) {
    throw new Error(`Model category '${category}' is not one of billing|product|support|other.`);
  }

  return {
    question,
    category: category as ModelAgentOutput["category"],
    modelText: trimmed,
    binding: MODEL_BINDING,
  };
}

export async function executeModelPoweredAgent(
  input: JsonValue,
  context: { readonly models: { generateText(options: GenerateTextOptions): Promise<{ text: string }> } },
): Promise<ModelAgentOutput> {
  const request = parseModelAgentInput(input);
  const generated = await context.models.generateText(buildGenerateTextOptions(request));
  return parseModelAgentOutput(request.question, generated.text);
}

function toJsonObject(output: ModelAgentOutput): JsonObject {
  return {
    question: output.question,
    category: output.category,
    modelText: output.modelText,
    binding: output.binding,
  };
}

export const modelPoweredRuntime = createRuntime({
  execute: async (input, context) => toJsonObject(await executeModelPoweredAgent(input, context)),
});

export function buildAgentManifest(runtimeUrl: string, modelProfileVersionId: ModelProfileVersionId) {
  return {
    schemaVersion: "1" as const,
    key: "model-powered-agent",
    name: "Model-Powered Agent",
    runtime: {
      type: "REMOTE_HTTP" as const,
      protocolVersion: "1" as const,
      endpoint: runtimeUrl,
      timeoutMs: 60_000,
    },
    input: {
      schema: {
        type: "object",
        properties: {
          question: { type: "string", minLength: 1 },
          maxOutputTokens: { type: "integer", minimum: 1 },
        },
        required: ["question"],
        additionalProperties: false,
      },
    },
    output: {
      schema: {
        type: "object",
        properties: {
          question: { type: "string" },
          category: { type: "string", enum: ["billing", "product", "support", "other"] },
          modelText: { type: "string" },
          binding: { type: "string" },
        },
        required: ["question", "category", "modelText", "binding"],
        additionalProperties: false,
      },
    },
    execution: { timeoutMs: 60_000, maxAttempts: 1 },
    capabilities: { model: true, tools: [] as string[] },
    models: { [MODEL_BINDING]: { modelProfileVersionId } },
  };
}
