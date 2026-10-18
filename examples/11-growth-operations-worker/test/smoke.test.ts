import { workflowDefinitionSchema } from "@osva-ai/contracts/schemas";
import { describe, expect, it, vi } from "vitest";

import {
  actionAllowedAfterApproval,
  analyzeCustomerSignals,
  buildEvidenceRecords,
  diagnoseGrowthConstraint,
  generateOpportunities,
  prepareAction,
  runCriticReview,
  selectIntervention,
  verifyExecution,
} from "../src/analysis.js";
import { executeExecuteDemoAction, executeGetCommerceMetrics, executeGetFunnelMetrics } from "../src/connector.js";
import { buildSignalBundle, executeDemoAction, resetGrowthOpsFixtures } from "../src/fixtures.js";
import {
  DEFAULT_BUSINESS_ID,
  DEFAULT_GROWTH_OBJECTIVE,
  buildGrowthOpsWorkerRequest,
  validateGrowthOpsWorkerInput,
} from "../src/input.js";
import { renderGrowthOperationsBriefMarkdown } from "../src/report.js";
import { COMMERCE_TOOL_BINDING, buildGrowthOperationsAgentManifest } from "../src/runtime.js";
import {
  APPROVAL_NODE,
  BRANCH_NODE,
  EXECUTE_NODE,
  PREPARE_NODE,
  REPORT_NODE,
  WORKFLOW_STAGE_ORDER,
  buildWorkflowDefinition,
} from "../src/workflow.js";

function loadContext() {
  resetGrowthOpsFixtures();
  const signals = buildSignalBundle(DEFAULT_BUSINESS_ID);
  const evidence = buildEvidenceRecords(signals);
  const diagnosis = diagnoseGrowthConstraint(DEFAULT_GROWTH_OBJECTIVE, signals, evidence);
  const opportunities = generateOpportunities(diagnosis, evidence);
  const critic = runCriticReview(opportunities, diagnosis, DEFAULT_GROWTH_OBJECTIVE);
  return { signals, evidence, diagnosis, opportunities, critic };
}

describe("growth operations worker public contracts", () => {
  it("validates growth operations input", () => {
    expect(
      validateGrowthOpsWorkerInput({
        businessId: DEFAULT_BUSINESS_ID,
        objective: DEFAULT_GROWTH_OBJECTIVE,
      }),
    ).toEqual({ businessId: DEFAULT_BUSINESS_ID, objective: DEFAULT_GROWTH_OBJECTIVE });
    expect(() =>
      validateGrowthOpsWorkerInput({ businessId: DEFAULT_BUSINESS_ID, objective: "invalid-objective" }),
    ).toThrow(/objective/);
    expect(() => validateGrowthOpsWorkerInput({ businessId: "Bad_ID", objective: DEFAULT_GROWTH_OBJECTIVE })).toThrow(
      /businessId/,
    );
  });

  it("collects fixture metrics through MCP handlers", async () => {
    resetGrowthOpsFixtures();
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const commerce = await executeGetCommerceMetrics({ businessId: DEFAULT_BUSINESS_ID });
    const funnel = await executeGetFunnelMetrics({ businessId: DEFAULT_BUSINESS_ID });
    write.mockRestore();
    expect(commerce.commerce.revenue).toBeGreaterThan(0);
    expect(funnel.funnel.addToCart).toBeGreaterThan(funnel.funnel.checkoutStarted);
  });

  it("diagnoses conversion constraint with evidence traceability", () => {
    const { signals, evidence, diagnosis } = loadContext();
    expect(diagnosis.constraint).toBe("conversion");
    expect(diagnosis.evidenceIds.length).toBeGreaterThan(0);
    expect(diagnosis.evidenceIds.every((id) => evidence.some((item) => item.id === id))).toBe(true);
    expect(signals.funnel.checkoutStarted).toBeLessThan(signals.funnel.addToCart);
  });

  it("analyzes customer checkout friction signals", () => {
    const { signals, evidence } = loadContext();
    const insight = analyzeCustomerSignals(signals, evidence);
    expect(insight.topThemes).toContain("shipping-cost-checkout");
    expect(insight.checkoutFrictionScore).toBeGreaterThan(0.5);
  });

  it("generates opportunities linked to evidence", () => {
    const { evidence, diagnosis, opportunities } = loadContext();
    expect(opportunities.length).toBeGreaterThanOrEqual(2);
    expect(opportunities.every((opp) => opp.supportingEvidenceIds.length >= 1)).toBe(true);
    expect(generateOpportunities(diagnosis, evidence).some((item) => item.id === "opp-shipping-threshold-test")).toBe(
      true,
    );
  });

  it("critic downgrades high-risk flash sale for conversion objective", () => {
    const { diagnosis, opportunities } = loadContext();
    const critic = runCriticReview(opportunities, diagnosis, "improve-conversion");
    const flash = critic.adjustedOpportunities.find((item) => item.opportunityId === "opp-flash-discount-paid");
    expect(flash?.downgraded).toBe(true);
    expect(flash?.adjustedPriority).toBeLessThan(40);
    expect(critic.issues.some((issue) => issue.code === "metric-mismatch")).toBe(true);
  });

  it("critic flags contradictory campaign signal when constraint is conversion", () => {
    const { diagnosis, opportunities } = loadContext();
    const critic = runCriticReview(opportunities, diagnosis, DEFAULT_GROWTH_OBJECTIVE);
    expect(critic.issues.some((issue) => issue.code === "weak-evidence-link")).toBe(true);
  });

  it("selects conversion intervention over downgraded flash sale", () => {
    const { opportunities, critic } = loadContext();
    const selected = selectIntervention(opportunities, critic, DEFAULT_GROWTH_OBJECTIVE);
    expect(selected.opportunityId).toBe("opp-shipping-threshold-test");
    expect(selected.interventionRoute).toBe("conversion-action");
  });

  it("routes intervention types for workflow branch selector", () => {
    const { opportunities, critic } = loadContext();
    const selected = selectIntervention(opportunities, critic, "reduce-acquisition-cost");
    expect(["content-action", "campaign-action", "conversion-action", "retention-action", "monitor-only"]).toContain(
      selected.interventionRoute,
    );
  });

  it("prepares action before approval with monitoring metric", () => {
    const { opportunities } = loadContext();
    const opp = opportunities.find((item) => item.id === "opp-shipping-threshold-test");
    expect(opp).toBeDefined();
    const request = buildGrowthOpsWorkerRequest(
      validateGrowthOpsWorkerInput({ businessId: DEFAULT_BUSINESS_ID, objective: DEFAULT_GROWTH_OBJECTIVE }),
      "run-prepare-001",
    );
    const prepared = prepareAction(request, opp!, "conversion-action");
    expect(prepared.monitoringMetric).toBe("checkout_started_rate");
    expect(prepared.actionId.length).toBeGreaterThan(8);
  });

  it("rejected approval blocks demo action policy", () => {
    expect(actionAllowedAfterApproval({ decision: "REJECTED" })).toBe(false);
    expect(actionAllowedAfterApproval({ decision: "APPROVED" })).toBe(true);
  });

  it("executes demo actions idempotently", async () => {
    resetGrowthOpsFixtures();
    const first = executeDemoAction({
      businessId: DEFAULT_BUSINESS_ID,
      actionId: "demo-action-001",
      actionType: "landing-experiment",
      title: "Checkout test",
      monitoringMetric: "checkout_started_rate",
    });
    const second = executeDemoAction({
      businessId: DEFAULT_BUSINESS_ID,
      actionId: "demo-action-001",
      actionType: "landing-experiment",
      title: "Checkout test",
      monitoringMetric: "checkout_started_rate",
    });
    expect(first.status).toBe("completed");
    expect(second.status).toBe("already-completed");
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const viaMcp = await executeExecuteDemoAction({
      businessId: DEFAULT_BUSINESS_ID,
      actionId: "demo-action-002",
      actionType: "monitor-only",
      title: "Monitor",
      monitoringMetric: "checkout_started_rate",
    });
    write.mockRestore();
    expect(viaMcp.result.status).toBe("completed");
  });

  it("verifies execution state without fabricating uplift", () => {
    resetGrowthOpsFixtures();
    const actionId = "verify-action-001";
    executeDemoAction({
      businessId: DEFAULT_BUSINESS_ID,
      actionId,
      actionType: "content-optimization",
      title: "SEO task",
      monitoringMetric: "organic_ctr",
    });
    const verification = verifyExecution(actionId, "organic_ctr");
    expect(verification.actionRecorded).toBe(true);
    expect(verification.monitoringMetricAttached).toBe(true);
    expect(verification.notes.some((note) => note.includes("no uplift"))).toBe(true);
  });

  it("renders growth operations brief sections", () => {
    const { signals, evidence, diagnosis, opportunities, critic } = loadContext();
    const request = buildGrowthOpsWorkerRequest(
      validateGrowthOpsWorkerInput({ businessId: DEFAULT_BUSINESS_ID, objective: DEFAULT_GROWTH_OBJECTIVE }),
      "run-report-001",
    );
    const selected = selectIntervention(opportunities, critic, DEFAULT_GROWTH_OBJECTIVE);
    const opp = opportunities.find((item) => item.id === selected.opportunityId)!;
    const prepared = prepareAction(request, opp, selected.interventionRoute);
    const markdown = renderGrowthOperationsBriefMarkdown({
      request,
      signals,
      evidence,
      diagnosis,
      customerInsight: analyzeCustomerSignals(signals, evidence),
      research: { notes: ["Fixture research note."], supportingEvidenceIds: diagnosis.evidenceIds.slice(0, 1) },
      opportunities,
      critic,
      selected,
      prepared,
      approvalSummary: {
        constraint: diagnosis.constraint,
        evidenceHighlights: evidence.slice(0, 2).map((item) => item.observation),
        selectedIntervention: opp.hypothesis,
        expectedMetric: opp.expectedMetric,
        riskReview: "Demo risk review.",
        proposedAction: prepared.title,
      },
      actionResult: {
        actionId: prepared.actionId,
        status: "completed",
        details: "recorded",
        monitoringMetric: prepared.monitoringMetric,
      },
    });
    expect(markdown).toContain("# Growth Operations Brief");
    expect(markdown).toContain("## Critic Review");
    expect(markdown).toContain("does not fabricate experiment outcomes");
  });

  it("defines workflow with branch routing and approval before execute", () => {
    const definition = buildWorkflowDefinition("agv_demo" as never);
    const parsed = workflowDefinitionSchema.parse(definition);
    const branch = parsed.nodes.find((node) => node.key === BRANCH_NODE);
    expect(branch?.type).toBe("BRANCH");
    if (branch?.type === "BRANCH") {
      expect(branch.selector).toBe("/interventionRoute");
      expect(branch.cases.some((item) => item.equals === "conversion-action" && item.to === PREPARE_NODE)).toBe(true);
    }
    const approvalIndex = WORKFLOW_STAGE_ORDER.indexOf(APPROVAL_NODE);
    const executeIndex = WORKFLOW_STAGE_ORDER.indexOf(EXECUTE_NODE);
    expect(approvalIndex).toBeLessThan(executeIndex);
    expect(parsed.edges.some((edge) => edge.from === APPROVAL_NODE && edge.to === EXECUTE_NODE)).toBe(true);
    expect(parsed.nodes.some((node) => node.key === REPORT_NODE)).toBe(true);
  });

  it("binds growth ops tools in manifest without credentials", () => {
    const manifest = buildGrowthOperationsAgentManifest("http://127.0.0.1:8806/execute", {
      commerce: "tv1" as never,
      funnel: "tv2" as never,
      campaign: "tv3" as never,
      customer: "tv4" as never,
      content: "tv5" as never,
      product: "tv6" as never,
      execute: "tv7" as never,
    });
    expect(manifest.runtime.type).toBe("REMOTE_HTTP");
    expect(manifest.capabilities.tools).toContain(COMMERCE_TOOL_BINDING);
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });

  it("documents approval placement relative to prepare and execute nodes", () => {
    expect(WORKFLOW_STAGE_ORDER.indexOf(PREPARE_NODE)).toBeLessThan(WORKFLOW_STAGE_ORDER.indexOf(APPROVAL_NODE));
    expect(WORKFLOW_STAGE_ORDER.indexOf(APPROVAL_NODE)).toBeLessThan(WORKFLOW_STAGE_ORDER.indexOf(EXECUTE_NODE));
  });
});
