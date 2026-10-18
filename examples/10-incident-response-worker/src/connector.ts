import { defineConnector, defineTool } from "@osva-ai/connector-sdk";

import {
  getFixtureDependencyHealth,
  getFixtureRecentDeployments,
  getFixtureRecentLogs,
  getFixtureServiceHealth,
  restartService,
  rollbackDeployment,
} from "./fixtures.js";
import type { DependencyHealth, DeploymentRecord, LogEvent, ServiceHealth } from "./types.js";

function readService(input: unknown): string {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("service must be a string");
  }
  const service = (input as Record<string, unknown>)["service"];
  if (typeof service !== "string" || service.trim().length === 0) {
    throw new Error("service must be a string");
  }
  return service.trim();
}

export async function executeGetServiceHealth(input: unknown): Promise<{ health: ServiceHealth }> {
  const service = readService(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_service_health.invoked", service })}\n`);
  return { health: getFixtureServiceHealth(service) };
}

export async function executeGetRecentLogs(input: unknown): Promise<{ logs: LogEvent[] }> {
  const service = readService(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_recent_logs.invoked", service })}\n`);
  return { logs: getFixtureRecentLogs(service) };
}

export async function executeGetRecentDeployments(input: unknown): Promise<{ deployments: DeploymentRecord[] }> {
  const service = readService(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_recent_deployments.invoked", service })}\n`);
  return { deployments: getFixtureRecentDeployments(service) };
}

export async function executeGetDependencyHealth(input: unknown): Promise<{ dependencies: DependencyHealth[] }> {
  const service = readService(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_dependency_health.invoked", service })}\n`);
  return { dependencies: getFixtureDependencyHealth(service) };
}

export async function executeRollbackDeployment(
  input: unknown,
): Promise<{ result: ReturnType<typeof rollbackDeployment> }> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("rollback input must be an object.");
  }
  const record = input as Record<string, unknown>;
  const service = readService(record);
  const deploymentId = record["deploymentId"];
  const actionId = record["actionId"];
  if (typeof deploymentId !== "string" || typeof actionId !== "string") {
    throw new Error("deploymentId and actionId are required.");
  }
  process.stderr.write(`${JSON.stringify({ event: "mcp.rollback_deployment.invoked", service, deploymentId })}\n`);
  return { result: rollbackDeployment({ service, deploymentId, actionId }) };
}

export async function executeRestartService(input: unknown): Promise<{ result: ReturnType<typeof restartService> }> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("restart input must be an object.");
  }
  const record = input as Record<string, unknown>;
  const service = readService(record);
  const actionId = record["actionId"];
  if (typeof actionId !== "string") {
    throw new Error("actionId is required.");
  }
  process.stderr.write(`${JSON.stringify({ event: "mcp.restart_service.invoked", service })}\n`);
  return { result: restartService({ service, actionId }) };
}

const serviceSchema = {
  type: "object",
  properties: { service: { type: "string" } },
  required: ["service"],
  additionalProperties: false,
} as const;

export const getServiceHealthTool = defineTool({
  name: "get_service_health",
  description: "Returns deterministic service health fixtures.",
  inputSchema: serviceSchema,
  handler: executeGetServiceHealth,
});

export const getRecentLogsTool = defineTool({
  name: "get_recent_logs",
  description: "Returns deterministic recent log events for a service.",
  inputSchema: serviceSchema,
  handler: executeGetRecentLogs,
});

export const getRecentDeploymentsTool = defineTool({
  name: "get_recent_deployments",
  description: "Returns deterministic deployment history for a service.",
  inputSchema: serviceSchema,
  handler: executeGetRecentDeployments,
});

export const getDependencyHealthTool = defineTool({
  name: "get_dependency_health",
  description: "Returns deterministic dependency health for a service blast radius.",
  inputSchema: serviceSchema,
  handler: executeGetDependencyHealth,
});

export const rollbackDeploymentTool = defineTool({
  name: "rollback_deployment",
  description: "Simulates deployment rollback in demo fixture state only.",
  inputSchema: {
    type: "object",
    properties: {
      service: { type: "string" },
      deploymentId: { type: "string" },
      actionId: { type: "string" },
    },
    required: ["service", "deploymentId", "actionId"],
    additionalProperties: false,
  },
  handler: executeRollbackDeployment,
});

export const restartServiceTool = defineTool({
  name: "restart_service",
  description: "Simulates service restart in demo fixture state only.",
  inputSchema: {
    type: "object",
    properties: {
      service: { type: "string" },
      actionId: { type: "string" },
    },
    required: ["service", "actionId"],
    additionalProperties: false,
  },
  handler: executeRestartService,
});

export const incidentOpsConnector = defineConnector({
  key: "osva-examples-incident-ops",
  name: "OSVA Examples Incident Ops",
  description: "Fixture-backed incident diagnostics and simulated remediation tools.",
  version: "1.0.0",
  tools: [
    getServiceHealthTool,
    getRecentLogsTool,
    getRecentDeploymentsTool,
    getDependencyHealthTool,
    rollbackDeploymentTool,
    restartServiceTool,
  ],
});
