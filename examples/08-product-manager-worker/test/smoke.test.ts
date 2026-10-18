import { workflowDefinitionSchema } from "@osva-ai/contracts/schemas";
import { describe, expect, it, vi } from "vitest";

import { executeGetCustomerFeedback, executeGetProductMetrics } from "../src/connector.js";
import { DEMO_EVIDENCE, buildEvidenceBundle } from "../src/fixtures.js";
import { DEFAULT_PRODUCT_ID, validateProductWorkerInput } from "../src/input.js";
import {
  analyzeOpportunities,
  assertClusterTraceability,
  clusterProblems,
  draftProductBrief,
  prioritizeOpportunities,
} from "../src/product.js";
import { buildApprovalSummary, renderProductBriefMarkdown } from "../src/report.js";
import { reviewProductBrief } from "../src/review.js";
import { PRODUCT_FEEDBACK_TOOL_BINDING, buildProductManagerAgentManifest } from "../src/runtime.js";
import {
  APPROVAL_NODE,
  COLLECT_NODE,
  REPORT_NODE,
  REVIEW_NODE,
  WORKFLOW_STAGE_ORDER,
  buildWorkflowDefinition,
} from "../src/workflow.js";

const demoRequest = {
  briefId: "brief-test",
  productId: DEFAULT_PRODUCT_ID,
  objective: "Improve activation for new users",
};

function runFixturePipeline() {
  const evidence = buildEvidenceBundle(DEFAULT_PRODUCT_ID);
  const clusters = clusterProblems(evidence);
  assertClusterTraceability(clusters, evidence);
  const opportunities = analyzeOpportunities(evidence, clusters);
  const prioritization = prioritizeOpportunities(opportunities, clusters);
  const brief = draftProductBrief({ request: demoRequest, evidence, prioritization, clusters });
  const topOpportunity = prioritization.opportunities[0];
  const review = reviewProductBrief({ brief, evidence, opportunity: topOpportunity });
  const approvalSummary = buildApprovalSummary({ brief, prioritization, review });
  const markdown = renderProductBriefMarkdown({
    request: demoRequest,
    evidence,
    clusters,
    prioritization,
    brief,
    review,
    approvalSummary,
  });
  return { evidence, clusters, opportunities, prioritization, brief, review, markdown };
}

describe("product manager worker public contracts", () => {
  it("validates product worker request input", () => {
    expect(
      validateProductWorkerInput({
        productId: DEFAULT_PRODUCT_ID,
        objective: "Improve activation",
      }),
    ).toEqual({
      productId: DEFAULT_PRODUCT_ID,
      objective: "Improve activation",
    });
    expect(() => validateProductWorkerInput({ productId: "Bad" })).toThrow(/lowercase/);
    expect(() => validateProductWorkerInput({ productId: DEFAULT_PRODUCT_ID, objective: "x".repeat(201) })).toThrow(
      /200 characters/,
    );
  });

  it("retrieves fixture evidence through MCP handlers", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const feedback = await executeGetCustomerFeedback({ productId: DEFAULT_PRODUCT_ID });
    const metrics = await executeGetProductMetrics({ productId: DEFAULT_PRODUCT_ID });
    write.mockRestore();
    expect(feedback.feedback.length).toBe(DEMO_EVIDENCE.feedback.length);
    expect(metrics.metrics.signups).toBe(DEMO_EVIDENCE.metrics.signups);
  });

  it("clusters feedback and tickets into transparent themes", () => {
    const { evidence, clusters } = runFixturePipeline();
    const onboarding = clusters.find((cluster) => cluster.id === "cluster-onboarding");
    expect(onboarding).toBeDefined();
    expect(onboarding?.feedbackIds.length).toBeGreaterThan(2);
    expect(onboarding?.ticketIds.length).toBeGreaterThan(0);
    expect(() => assertClusterTraceability(clusters, evidence)).not.toThrow();
  });

  it("preserves evidence references on problem clusters", () => {
    const evidence = buildEvidenceBundle(DEFAULT_PRODUCT_ID);
    const clusters = clusterProblems(evidence);
    for (const cluster of clusters) {
      expect(cluster.feedbackIds.every((id) => evidence.feedback.some((item) => item.id === id))).toBe(true);
      expect(cluster.ticketIds.every((id) => evidence.tickets.some((item) => item.id === id))).toBe(true);
    }
  });

  it("uses quantitative onboarding drop-off in evidence strength", () => {
    const evidence = buildEvidenceBundle(DEFAULT_PRODUCT_ID);
    const clusters = clusterProblems(evidence);
    const opportunities = analyzeOpportunities(evidence, clusters);
    const onboarding = opportunities.find((item) => item.problemClusterId === "cluster-onboarding");
    expect(onboarding?.evidenceStrength).toBe("high");
  });

  it("assigns low business alignment to repeated dark mode demand", () => {
    const evidence = buildEvidenceBundle(DEFAULT_PRODUCT_ID);
    const clusters = clusterProblems(evidence);
    const opportunities = analyzeOpportunities(evidence, clusters);
    const darkMode = opportunities.find((item) => item.problemClusterId === "cluster-dark-mode");
    expect(darkMode?.businessAlignment).toBe("low");
  });

  it("does not let frequent dark mode requests outrank onboarding activation work", () => {
    const { prioritization } = runFixturePipeline();
    const top = prioritization.opportunities[0];
    const darkMode = prioritization.opportunities.find((item) => item.problemClusterId === "cluster-dark-mode");
    expect(top?.problemClusterId).toBe("cluster-onboarding");
    expect(darkMode).toBeDefined();
    if (top === undefined || darkMode === undefined) return;
    expect(top.priorityRank).toBeLessThan(darkMode.priorityRank);
    expect(top.priorityScore).toBeGreaterThan(darkMode.priorityScore);
  });

  it("prioritizes opportunities with explainable scores", () => {
    const { prioritization } = runFixturePipeline();
    for (const opportunity of prioritization.opportunities) {
      expect(opportunity.rationale).toMatch(/score=/);
    }
  });

  it("drafts a problem-first product brief for the top opportunity", () => {
    const { brief } = runFixturePipeline();
    expect(brief.problem.length).toBeGreaterThan(20);
    expect(brief.proposedApproach.length).toBeGreaterThan(0);
    expect(brief.title.toLowerCase()).toContain("onboarding");
    expect(brief.successMetrics.length).toBeGreaterThan(0);
  });

  it("reviewer flags business conflict between enterprise pricing cues and activation goal", () => {
    const { brief, evidence, prioritization } = runFixturePipeline();
    const review = reviewProductBrief({ brief, evidence, opportunity: prioritization.opportunities[0] });
    expect(review.issues.some((issue) => issue.type === "business-conflict")).toBe(true);
  });

  it("reviewer detects missing metrics on a thin brief", () => {
    const evidence = buildEvidenceBundle(DEFAULT_PRODUCT_ID);
    const brief = {
      title: "Thin brief",
      problem: "Users are confused during onboarding and cannot finish setup.",
      targetUser: "Trial admins",
      evidence: ["Feedback fb-001"],
      goal: "Improve activation",
      nonGoals: [],
      proposedApproach: ["Redesign onboarding"],
      successMetrics: ["TBD"],
      risks: [],
      openQuestions: [],
    };
    const review = reviewProductBrief({ brief, evidence, opportunity: undefined });
    expect(review.issues.some((issue) => issue.type === "missing-metric")).toBe(true);
  });

  it("renders a Markdown product brief artifact payload", () => {
    const { markdown } = runFixturePipeline();
    expect(markdown).toMatch(/^# Product Brief/);
    expect(markdown).toContain("## Evidence");
    expect(markdown).toContain("opp-onboarding");
    expect(markdown).toContain("## Reviewer Concerns");
  });

  it("builds a multi-stage V3 workflow with review before approval and publish last", () => {
    const definition = buildWorkflowDefinition("agent_version_test" as never);
    expect(() => workflowDefinitionSchema.parse(definition)).not.toThrow();
    expect(definition.nodes.map((node) => node.key)).toEqual([...WORKFLOW_STAGE_ORDER]);
    const reviewIndex = definition.nodes.findIndex((node) => node.key === REVIEW_NODE);
    const approvalIndex = definition.nodes.findIndex((node) => node.key === APPROVAL_NODE);
    const reportIndex = definition.nodes.findIndex((node) => node.key === REPORT_NODE);
    expect(reviewIndex).toBeLessThan(approvalIndex);
    expect(reportIndex).toBeGreaterThan(approvalIndex);
    expect(definition.nodes.find((node) => node.key === COLLECT_NODE)?.type).toBe("AGENT");
    expect(definition.nodes.find((node) => node.key === APPROVAL_NODE)?.type).toBe("APPROVAL");
    expect(definition.nodes.find((node) => node.key === REPORT_NODE)?.type).toBe("AGENT");
  });

  it("binds product evidence tools in the agent manifest without credentials", () => {
    const manifest = buildProductManagerAgentManifest("http://127.0.0.1:8800/execute", {
      feedback: "tool_feedback" as never,
      tickets: "tool_tickets" as never,
      metrics: "tool_metrics" as never,
      context: "tool_context" as never,
    });
    expect(manifest.capabilities.tools).toContain(PRODUCT_FEEDBACK_TOOL_BINDING);
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });
});
