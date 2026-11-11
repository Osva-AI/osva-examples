import { randomUUID } from "node:crypto";

import type { AgentId, AgentVersionId, RunAttemptResourceV1 } from "@osva-ai/contracts";
import { OsvaClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import type { CommerceGrowthStructuredOutput } from "./agent-types.js";
import { buildAgentManifestForRuntime, ensureCommerceGrowthConnectorsAndTools } from "./bootstrap.js";
import {
  buildPublishedGa4ConnectorStdioTransport,
  buildPublishedShopifyConnectorStdioTransport,
} from "./connector/stdio-command.js";
import { deployTrustedCommerceGrowthAnalyst } from "./deploy-trusted.js";
import { FIXTURE_GA4_PROPERTY_ID, FIXTURE_RUN_KEY } from "./bindings.js";
import { startExampleServices } from "./services.js";

const TERMINAL_ATTEMPTS = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);

export interface CommerceGrowthExampleResult {
  readonly workspaceId: string;
  readonly runtimeMode: "REMOTE_HTTP" | "TRUSTED_TYPESCRIPT";
  readonly shopifyConnectorId: string;
  readonly shopifyConnectorVersionId: string;
  readonly ga4ConnectorId: string;
  readonly ga4ConnectorVersionId: string;
  readonly toolVersionIds: Record<string, string>;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly runId: string;
  readonly attemptStatus: string;
  readonly output?: CommerceGrowthStructuredOutput;
  readonly toolActivity: readonly unknown[];
  readonly polling: { readonly attempts: number; readonly elapsedMs: number };
}

export async function runCommerceGrowthAnalystExample(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CommerceGrowthExampleResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const trustedRoot = env.OSVA_TRUSTED_RUNTIME_ROOT?.trim();
  const runtimeUrl = env.OSVA_AGENT_RUNTIME_URL?.trim();
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8802, env);
  const timeoutMs = optionalPositiveIntEnv("OSVA_RUN_TIMEOUT_MS", 240_000, env);
  const intervalMs = optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env);

  const startDate = env.OSVA_EXAMPLE_START_DATE?.trim() || "2025-06-01";
  const endDate = env.OSVA_EXAMPLE_END_DATE?.trim() || "2025-06-30";
  const ga4PropertyId = env.OSVA_EXAMPLE_GA4_PROPERTY_ID?.trim() || FIXTURE_GA4_PROPERTY_ID;
  const maxOrderSampleSize = optionalPositiveIntEnv("OSVA_EXAMPLE_MAX_ORDER_SAMPLE", 25, env);
  const maxProductSampleSize = optionalPositiveIntEnv("OSVA_EXAMPLE_MAX_PRODUCT_SAMPLE", 25, env);
  const orderListPageLimit = optionalPositiveIntEnv("OSVA_EXAMPLE_ORDER_PAGE_LIMIT", 2, env);
  const productListPageLimit = optionalPositiveIntEnv("OSVA_EXAMPLE_PRODUCT_PAGE_LIMIT", 1, env);
  const ga4ReportLimit = optionalPositiveIntEnv("OSVA_EXAMPLE_GA4_REPORT_LIMIT", 50, env);
  const suffix = (env.OSVA_EXAMPLE_KEY_SUFFIX?.trim() || randomUUID().slice(0, 8)).toLowerCase();

  const useTrusted = trustedRoot !== undefined && trustedRoot.length > 0;
  const useStdioConnector = parseStdioConnectorOptIn(env, useTrusted);

  if (!useTrusted && (runtimeUrl === undefined || runtimeUrl.length === 0)) {
    throw new Error("Set OSVA_AGENT_RUNTIME_URL for REMOTE_HTTP mode or OSVA_TRUSTED_RUNTIME_ROOT for trusted mode.");
  }
  if (!useStdioConnector) {
    throw new Error(
      "Shopify and GA4 MCP require worker STDIO. Set OSVA_MCP_CONNECTOR_STDIO=true (or use OSVA_TRUSTED_RUNTIME_ROOT).",
    );
  }

  const services = useTrusted
    ? undefined
    : await startExampleServices({
        host,
        runtimePort,
      });

  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const auth = await client.auth.getContext();

    const tools = await ensureCommerceGrowthConnectorsAndTools(client, {
      suffix,
      shopifyStdio: resolveShopifyStdioTransport(env),
      ga4Stdio: resolveGa4StdioTransport(env),
    });

    const trusted = useTrusted ? await deployTrustedCommerceGrowthAnalyst(trustedRoot as string) : undefined;
    const manifest = buildAgentManifestForRuntime({
      ...(trusted === undefined ? { runtimeUrl: runtimeUrl as string } : { trusted }),
      tools,
    });

    const agent = await client.agents.create({
      key: `examples-commerce-growth-analyst-${suffix}`,
      name: `Examples Commerce & Growth Analyst ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, { manifest });

    const runKey = ga4PropertyId === FIXTURE_GA4_PROPERTY_ID ? FIXTURE_RUN_KEY : `live-${suffix}`;

    const created = await client.runs.create({
      agentId: agent.id as AgentId,
      agentVersionId: agentVersion.id as AgentVersionId,
      input: {
        startDate,
        endDate,
        ga4PropertyId,
        maxOrderSampleSize,
        maxProductSampleSize,
        orderListPageLimit,
        productListPageLimit,
        ga4ReportLimit,
        runKey,
      },
    });

    const polled = await pollWithDeadline<RunAttemptResourceV1>({
      description: `RunAttempt ${created.runAttempt.id}`,
      read: () => client.runs.getAttempt(created.run.id, created.runAttempt.id),
      isDone: (attempt) => TERMINAL_ATTEMPTS.has(attempt.status),
      summarize: (attempt) => attempt.status,
      timeoutMs,
      intervalMs,
    });

    const steps = await client.runObservability.listSteps(created.run.id, created.runAttempt.id);
    const toolActivity = steps.steps.filter((step) => step.kind === "TOOL");

    const output = polled.value.output as CommerceGrowthStructuredOutput | undefined;

    return {
      workspaceId: auth.workspaceId,
      runtimeMode: useTrusted ? "TRUSTED_TYPESCRIPT" : "REMOTE_HTTP",
      shopifyConnectorId: tools.shopifyConnectorId,
      shopifyConnectorVersionId: tools.shopifyConnectorVersionId,
      ga4ConnectorId: tools.ga4ConnectorId,
      ga4ConnectorVersionId: tools.ga4ConnectorVersionId,
      toolVersionIds: {
        shopifyShopGet: tools.shopifyShopGet,
        shopifyProductList: tools.shopifyProductList,
        shopifyOrderList: tools.shopifyOrderList,
        ga4PropertyGet: tools.ga4PropertyGet,
        ga4ReportAcquisition: tools.ga4ReportAcquisition,
        ga4ReportEcommerce: tools.ga4ReportEcommerce,
      },
      agentId: agent.id,
      agentVersionId: agentVersion.id,
      runId: created.run.id,
      attemptStatus: polled.value.status,
      ...(output === undefined ? {} : { output }),
      toolActivity,
      polling: { attempts: polled.attempts, elapsedMs: polled.elapsedMs },
    };
  } finally {
    await services?.close();
  }
}

function parseStdioConnectorOptIn(env: NodeJS.ProcessEnv, useTrusted: boolean): boolean {
  if (useTrusted) return true;
  return env.OSVA_MCP_CONNECTOR_STDIO?.trim().toLowerCase() === "true";
}

function resolveShopifyStdioTransport(env: NodeJS.ProcessEnv): {
  readonly command: string;
  readonly args: readonly string[];
} {
  const command = env.OSVA_SHOPIFY_MCP_STDIO_COMMAND?.trim();
  const argsJson = env.OSVA_SHOPIFY_MCP_STDIO_ARGS_JSON?.trim();
  if (command !== undefined && command.length > 0 && argsJson !== undefined && argsJson.length > 0) {
    return parseArgsOverride(command, argsJson, "OSVA_SHOPIFY_MCP_STDIO_ARGS_JSON");
  }
  return buildPublishedShopifyConnectorStdioTransport();
}

function resolveGa4StdioTransport(env: NodeJS.ProcessEnv): {
  readonly command: string;
  readonly args: readonly string[];
} {
  const command = env.OSVA_GA4_MCP_STDIO_COMMAND?.trim();
  const argsJson = env.OSVA_GA4_MCP_STDIO_ARGS_JSON?.trim();
  if (command !== undefined && command.length > 0 && argsJson !== undefined && argsJson.length > 0) {
    return parseArgsOverride(command, argsJson, "OSVA_GA4_MCP_STDIO_ARGS_JSON");
  }
  return buildPublishedGa4ConnectorStdioTransport();
}

function parseArgsOverride(
  command: string,
  argsJson: string,
  label: string,
): { readonly command: string; readonly args: readonly string[] } {
  const parsed: unknown = JSON.parse(argsJson);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be a JSON array of strings.`);
  }
  return { command, args: parsed };
}
