import { defineConnector, defineTool } from "@osva-ai/connector-sdk";

import {
  getFixtureCustomerSignals,
  getFixtureKpis,
  getFixtureOperationalIssues,
  getFixtureProjects,
  getFixtureSalesPipeline,
} from "./fixtures.js";
import type { CompanyKpis, CustomerSignals, OperationalIssue, ProjectUpdate, SalesPipelineSnapshot } from "./types.js";

function readCompanyId(input: unknown): string {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("companyId must be a string");
  }
  const companyId = (input as Record<string, unknown>)["companyId"];
  if (typeof companyId !== "string" || companyId.trim().length === 0) {
    throw new Error("companyId must be a string");
  }
  return companyId.trim();
}

export async function executeGetKpis(input: unknown): Promise<{ kpis: CompanyKpis }> {
  const companyId = readCompanyId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_kpis.invoked", companyId })}\n`);
  return { kpis: getFixtureKpis(companyId) };
}

export async function executeGetProjects(input: unknown): Promise<{ projects: ProjectUpdate[] }> {
  const companyId = readCompanyId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_projects.invoked", companyId })}\n`);
  return { projects: getFixtureProjects(companyId) };
}

export async function executeGetSalesPipeline(input: unknown): Promise<{ sales: SalesPipelineSnapshot }> {
  const companyId = readCompanyId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_sales_pipeline.invoked", companyId })}\n`);
  return { sales: getFixtureSalesPipeline(companyId) };
}

export async function executeGetCustomerSignals(input: unknown): Promise<{ customer: CustomerSignals }> {
  const companyId = readCompanyId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_customer_signals.invoked", companyId })}\n`);
  return { customer: getFixtureCustomerSignals(companyId) };
}

export async function executeGetOperationalIssues(input: unknown): Promise<{ operations: OperationalIssue[] }> {
  const companyId = readCompanyId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_operational_issues.invoked", companyId })}\n`);
  return { operations: getFixtureOperationalIssues(companyId) };
}

const companyIdSchema = {
  type: "object",
  properties: { companyId: { type: "string" } },
  required: ["companyId"],
  additionalProperties: false,
} as const;

export const getKpisTool = defineTool({
  name: "get_kpis",
  description: "Returns deterministic company KPI fixtures. Replace with warehouse/finance connectors in production.",
  inputSchema: companyIdSchema,
  handler: executeGetKpis,
});

export const getProjectsTool = defineTool({
  name: "get_projects",
  description: "Returns initiative/project updates from fixtures. Replace with Jira/Linear/Notion in production.",
  inputSchema: companyIdSchema,
  handler: executeGetProjects,
});

export const getSalesPipelineTool = defineTool({
  name: "get_sales_pipeline",
  description: "Returns CRM pipeline fixtures. Replace with Salesforce/HubSpot in production.",
  inputSchema: companyIdSchema,
  handler: executeGetSalesPipeline,
});

export const getCustomerSignalsTool = defineTool({
  name: "get_customer_signals",
  description: "Returns support and satisfaction fixtures. Replace with Zendesk/Intercom in production.",
  inputSchema: companyIdSchema,
  handler: executeGetCustomerSignals,
});

export const getOperationalIssuesTool = defineTool({
  name: "get_operational_issues",
  description: "Returns operational issue fixtures. Replace with internal ops systems in production.",
  inputSchema: companyIdSchema,
  handler: executeGetOperationalIssues,
});

export const companyOpsConnector = defineConnector({
  key: "osva-examples-company-ops",
  name: "OSVA Examples Company Ops",
  description: "Fixture-backed company operating data for the founder's office worker example.",
  version: "1.0.0",
  tools: [getKpisTool, getProjectsTool, getSalesPipelineTool, getCustomerSignalsTool, getOperationalIssuesTool],
});
