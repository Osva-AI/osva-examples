import { workflowDefinitionSchema } from "@osva-ai/contracts/schemas";
import { describe, expect, it, vi } from "vitest";

import { buildApprovalSummary, prepareRecommendedActions } from "../src/actions.js";
import { executeGetKpis, executeGetProjects } from "../src/connector.js";
import { DEMO_COMPANY_DATA, buildCompanyDataBundle } from "../src/fixtures.js";
import { DEFAULT_COMPANY_ID, validateFoundersOfficeInput } from "../src/input.js";
import {
  assertAttentionTraceability,
  detectRisksAndOpportunities,
  prioritizeAttentionItems,
} from "../src/priorities.js";
import { renderExecutiveBriefMarkdown } from "../src/report.js";
import { assertSignalTraceability, normalizeCompanySignals } from "../src/signals.js";
import { COMPANY_KPIS_TOOL_BINDING, buildFoundersOfficeAgentManifest } from "../src/runtime.js";
import {
  ACTIONS_NODE,
  APPROVAL_NODE,
  COLLECT_NODE,
  REPORT_NODE,
  WORKFLOW_STAGE_ORDER,
  buildWorkflowDefinition,
} from "../src/workflow.js";

const demoRequest = {
  briefId: "brief-test",
  companyId: DEFAULT_COMPANY_ID,
  objective: "Improve growth while keeping execution risks under control",
};

function runFixturePipeline() {
  const data = buildCompanyDataBundle(DEFAULT_COMPANY_ID);
  const signals = normalizeCompanySignals(data);
  assertSignalTraceability(signals);
  const detection = detectRisksAndOpportunities(signals);
  const prioritization = prioritizeAttentionItems(detection, signals, demoRequest);
  assertAttentionTraceability(prioritization.items, signals);
  const actions = prepareRecommendedActions(prioritization);
  const approvalSummary = buildApprovalSummary({ prioritization, actions });
  const markdown = renderExecutiveBriefMarkdown({
    request: demoRequest,
    data,
    signals,
    prioritization,
    actions,
    approvalSummary,
  });
  return { data, signals, detection, prioritization, actions, markdown };
}

describe("founder's office worker public contracts", () => {
  it("validates founder's office input", () => {
    expect(validateFoundersOfficeInput({ companyId: DEFAULT_COMPANY_ID, objective: " Focus " })).toEqual({
      companyId: DEFAULT_COMPANY_ID,
      objective: "Focus",
    });
    expect(() => validateFoundersOfficeInput({ companyId: "INVALID" })).toThrow(/lowercase/);
  });

  it("retrieves fixture company data through MCP handlers", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const kpis = await executeGetKpis({ companyId: DEFAULT_COMPANY_ID });
    const projects = await executeGetProjects({ companyId: DEFAULT_COMPANY_ID });
    write.mockRestore();
    expect(kpis.kpis.mrr).toBe(DEMO_COMPANY_DATA.kpis.mrr);
    expect(projects.projects.length).toBe(DEMO_COMPANY_DATA.projects.length);
  });

  it("normalizes raw inputs into structured signals with evidence", () => {
    const { signals } = runFixturePipeline();
    expect(signals.length).toBeGreaterThan(5);
    expect(signals.every((signal) => signal.evidence.length > 0)).toBe(true);
    expect(signals.some((signal) => signal.id === "sig-kpi-growth-slowdown")).toBe(true);
  });

  it("detects risks and opportunities with source traceability", () => {
    const { signals, detection } = runFixturePipeline();
    expect(detection.risks.some((item) => item.id === "risk-churn")).toBe(true);
    expect(detection.opportunities.some((item) => item.id === "opp-paid-scale")).toBe(true);
    assertAttentionTraceability([...detection.risks, ...detection.opportunities], signals);
  });

  it("does not promote ambiguous growth slowdown to a standalone attention item", () => {
    const { prioritization } = runFixturePipeline();
    expect(prioritization.items.some((item) => item.title.includes("deceleration"))).toBe(false);
    expect(prioritization.items.some((item) => item.sourceSignalIds.includes("sig-kpi-growth-slowdown"))).toBe(true);
  });

  it("ranks critical churn risk above low-value snack survey noise", () => {
    const { signals, prioritization } = runFixturePipeline();
    const snackSignal = signals.find((signal) => signal.id === "sig-request-req-snacks");
    expect(snackSignal?.urgency).toBe("low");
    const churn = prioritization.items.find((item) => item.id === "risk-churn");
    expect(churn?.priority).toMatch(/critical|high/);
    expect(prioritization.items[0]?.id).toBe("risk-churn");
  });

  it("generates recommended actions for top attention items", () => {
    const { actions, prioritization } = runFixturePipeline();
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(prioritization.items.some((item) => item.id === action.relatedPriorityId)).toBe(true);
    }
    expect(actions.some((action) => action.requiresApproval)).toBe(true);
  });

  it("renders an executive brief markdown artifact", () => {
    const { markdown } = runFixturePipeline();
    expect(markdown).toMatch(/^# Founder's Office Brief/);
    expect(markdown).toContain("## Critical Risks");
    expect(markdown).toContain("Worsening logo churn");
    expect(markdown).toContain("## Recommended Actions");
  });

  it("builds a V3 workflow with approval before the executive brief node", () => {
    const definition = buildWorkflowDefinition("agent_version_test" as never);
    expect(() => workflowDefinitionSchema.parse(definition)).not.toThrow();
    expect(definition.nodes.map((node) => node.key)).toEqual([...WORKFLOW_STAGE_ORDER]);
    const actionsIndex = definition.nodes.findIndex((node) => node.key === ACTIONS_NODE);
    const approvalIndex = definition.nodes.findIndex((node) => node.key === APPROVAL_NODE);
    const reportIndex = definition.nodes.findIndex((node) => node.key === REPORT_NODE);
    expect(approvalIndex).toBeGreaterThan(actionsIndex);
    expect(reportIndex).toBeGreaterThan(approvalIndex);
    expect(definition.nodes.find((node) => node.key === COLLECT_NODE)?.type).toBe("AGENT");
    expect(definition.nodes.find((node) => node.key === APPROVAL_NODE)?.type).toBe("APPROVAL");
    expect(definition.nodes.find((node) => node.key === REPORT_NODE)?.type).toBe("AGENT");
  });

  it("binds company ops tools in the agent manifest without credentials", () => {
    const manifest = buildFoundersOfficeAgentManifest("http://127.0.0.1:8802/execute", {
      kpis: "tool_kpis" as never,
      projects: "tool_projects" as never,
      sales: "tool_sales" as never,
      customer: "tool_customer" as never,
      operations: "tool_ops" as never,
    });
    expect(manifest.capabilities.tools).toContain(COMPANY_KPIS_TOOL_BINDING);
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });
});
