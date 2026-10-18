import { workflowDefinitionSchema } from "@osva-ai/contracts/schemas";
import { describe, expect, it, vi } from "vitest";

import { executeGetFunnelMetrics, executeGetTrafficMetrics } from "../src/connector.js";
import { DEMO_METRICS, buildMetricsBundle } from "../src/fixtures.js";
import {
  analyzeFunnel,
  assertExperimentTraceability,
  assertOpportunityTraceability,
  buildApprovalSummary,
  detectGrowthIssues,
  generateExperiments,
  generateOpportunities,
  prioritizeExperiments,
  runDiagnosis,
  safeRate,
} from "../src/growth.js";
import { DEFAULT_BUSINESS_ID, validateGrowthWorkerInput } from "../src/input.js";
import { renderGrowthBriefMarkdown } from "../src/report.js";
import {
  GROWTH_CAMPAIGN_TOOL_BINDING,
  GROWTH_TRAFFIC_TOOL_BINDING,
  buildGrowthAnalystAgentManifest,
} from "../src/runtime.js";
import {
  APPROVAL_NODE,
  COLLECT_NODE,
  PRIORITIZE_NODE,
  REPORT_NODE,
  WORKFLOW_STAGE_ORDER,
  buildWorkflowDefinition,
} from "../src/workflow.js";

const demoRequest = {
  analysisId: "analysis-test",
  businessId: DEFAULT_BUSINESS_ID,
  objective: "conversion" as const,
  context: "D2C outdoor gear demo",
};

function runFixturePipeline() {
  const metrics = buildMetricsBundle(DEFAULT_BUSINESS_ID);
  const funnelAnalysis = analyzeFunnel(metrics);
  const diagnosis = runDiagnosis(metrics, funnelAnalysis);
  const experiments = generateExperiments(diagnosis.opportunities);
  assertExperimentTraceability(experiments, diagnosis.opportunities);
  const prioritization = prioritizeExperiments(experiments, demoRequest.objective);
  const approvalSummary = buildApprovalSummary({
    request: demoRequest,
    metrics,
    funnelAnalysis,
    diagnosis,
    prioritization,
  });
  const markdown = renderGrowthBriefMarkdown({
    request: demoRequest,
    metrics,
    funnelAnalysis,
    diagnosis,
    prioritization,
    approvalSummary,
  });
  return { metrics, funnelAnalysis, diagnosis, experiments, prioritization, markdown };
}

describe("growth analyst worker public contracts", () => {
  it("validates growth worker request input", () => {
    expect(
      validateGrowthWorkerInput({
        businessId: DEFAULT_BUSINESS_ID,
        objective: "conversion",
        context: " demo ",
      }),
    ).toEqual({
      businessId: DEFAULT_BUSINESS_ID,
      objective: "conversion",
      context: "demo",
    });
    expect(() => validateGrowthWorkerInput({ businessId: "Bad ID" })).toThrow(/lowercase/);
    expect(() => validateGrowthWorkerInput({ businessId: DEFAULT_BUSINESS_ID, objective: "invalid" })).toThrow(
      /objective must be one of/,
    );
  });

  it("retrieves fixture metrics through MCP handlers", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const traffic = await executeGetTrafficMetrics({ businessId: DEFAULT_BUSINESS_ID });
    const funnel = await executeGetFunnelMetrics({ businessId: DEFAULT_BUSINESS_ID });
    write.mockRestore();
    expect(traffic.traffic.sessions).toBe(DEMO_METRICS.traffic.sessions);
    expect(funnel.funnel.addToCart).toBe(DEMO_METRICS.funnel.addToCart);
  });

  it("calculates funnel rates from fixture counts", () => {
    const { funnelAnalysis } = runFixturePipeline();
    expect(funnelAnalysis.rates.productViewToCartRate).toBeCloseTo(0.15, 4);
    expect(funnelAnalysis.rates.sessionToPurchaseRate).toBeCloseTo(0.0392, 4);
    expect(funnelAnalysis.rates.roas).toBeCloseTo(2, 4);
  });

  it("guards divide-by-zero when product views are zero", () => {
    const metrics = buildMetricsBundle("northpeak-zero-views");
    const analysis = analyzeFunnel(metrics);
    expect(safeRate(metrics.funnel.addToCart, metrics.funnel.productViews)).toBeNull();
    expect(analysis.rates.productViewToCartRate).toBeNull();
    expect(analysis.rates.sessionToPurchaseRate).toBe(0);
  });

  it("detects rule-based growth issues on the demo funnel", () => {
    const metrics = buildMetricsBundle(DEFAULT_BUSINESS_ID);
    const funnelAnalysis = analyzeFunnel(metrics);
    const findings = detectGrowthIssues(metrics, funnelAnalysis);
    expect(findings.some((item) => item.id === "finding-weak-add-to-cart")).toBe(true);
    expect(findings.some((item) => item.id === "finding-low-repeat")).toBe(true);
  });

  it("traces opportunities back to findings", () => {
    const { diagnosis } = runFixturePipeline();
    expect(() => assertOpportunityTraceability(diagnosis.opportunities, diagnosis.findings)).not.toThrow();
    const weakCart = diagnosis.opportunities.find((item) => item.id === "opp-improve-pdp-cta");
    expect(weakCart?.supportingFindingIds).toContain("finding-weak-add-to-cart");
  });

  it("generates experiments linked to opportunities", () => {
    const { diagnosis, experiments } = runFixturePipeline();
    expect(experiments.length).toBeGreaterThan(0);
    assertExperimentTraceability(experiments, diagnosis.opportunities);
  });

  it("prioritizes checkout and PDP experiments ahead of low-confidence paid tests for conversion objective", () => {
    const { prioritization } = runFixturePipeline();
    const top = prioritization.experiments[0];
    expect(top).toBeDefined();
    if (top === undefined) return;
    expect(["exp-pdp-cta-variant", "exp-checkout-shipping-banner"]).toContain(top.id);
    expect(top.targetMetric).not.toBe("paid_roas");
    for (let index = 1; index < prioritization.experiments.length; index += 1) {
      const previous = prioritization.experiments[index - 1];
      const current = prioritization.experiments[index];
      if (previous === undefined || current === undefined) continue;
      expect(previous.priorityScore).toBeGreaterThanOrEqual(current.priorityScore);
    }
  });

  it("maps weak add-to-cart to a prioritized opportunity in the pipeline", () => {
    const metrics = buildMetricsBundle(DEFAULT_BUSINESS_ID);
    const funnelAnalysis = analyzeFunnel(metrics);
    const findings = detectGrowthIssues(metrics, funnelAnalysis);
    const opportunities = generateOpportunities(findings);
    const weakStep = opportunities.find((item) => item.id === "opp-improve-pdp-cta");
    expect(weakStep).toBeDefined();
    const experiments = generateExperiments(opportunities);
    const prioritized = prioritizeExperiments(experiments, "conversion");
    expect(prioritized.experiments.some((item) => item.id === "exp-pdp-cta-variant")).toBe(true);
  });

  it("renders a Markdown growth brief artifact payload", () => {
    const { markdown } = runFixturePipeline();
    expect(markdown).toMatch(/^# Growth Analysis & Experiment Brief/);
    expect(markdown).toContain("## Funnel Snapshot");
    expect(markdown).toContain("finding-weak-add-to-cart");
    expect(markdown).toContain("exp-pdp-cta-variant");
  });

  it("builds a multi-stage V3 workflow with approval before the report node", () => {
    const definition = buildWorkflowDefinition("agent_version_test" as never);
    expect(() => workflowDefinitionSchema.parse(definition)).not.toThrow();
    expect(definition.nodes.map((node) => node.key)).toEqual([...WORKFLOW_STAGE_ORDER]);
    const approvalIndex = definition.nodes.findIndex((node) => node.key === APPROVAL_NODE);
    const reportIndex = definition.nodes.findIndex((node) => node.key === REPORT_NODE);
    const prioritizeIndex = definition.nodes.findIndex((node) => node.key === PRIORITIZE_NODE);
    expect(approvalIndex).toBeGreaterThan(prioritizeIndex);
    expect(reportIndex).toBeGreaterThan(approvalIndex);
    expect(definition.nodes.find((node) => node.key === COLLECT_NODE)?.type).toBe("AGENT");
    expect(definition.nodes.find((node) => node.key === APPROVAL_NODE)?.type).toBe("APPROVAL");
    expect(definition.nodes.find((node) => node.key === REPORT_NODE)?.type).toBe("AGENT");
  });

  it("binds growth metric tools in the agent manifest without credentials", () => {
    const manifest = buildGrowthAnalystAgentManifest("http://127.0.0.1:8798/execute", {
      traffic: "tool_traffic" as never,
      funnel: "tool_funnel" as never,
      revenue: "tool_revenue" as never,
      retention: "tool_retention" as never,
      campaign: "tool_campaign" as never,
    });
    expect(manifest.capabilities.tools).toContain(GROWTH_TRAFFIC_TOOL_BINDING);
    expect(manifest.capabilities.tools).toContain(GROWTH_CAMPAIGN_TOOL_BINDING);
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });
});
