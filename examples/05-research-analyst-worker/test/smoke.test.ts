import { workflowDefinitionSchema } from "@osva-ai/contracts/schemas";
import { describe, expect, it, vi } from "vitest";

import { applyReviewAdjustments, synthesizeThemes } from "../src/analysis.js";
import { executeSearchSources } from "../src/connector.js";
import { RESEARCH_CORPUS, searchFixtureSources } from "../src/fixtures.js";
import { DEFAULT_RESEARCH_QUESTION, validateResearchWorkerInput } from "../src/input.js";
import { createResearchPlan } from "../src/planner.js";
import { renderResearchReportMarkdown } from "../src/report.js";
import { assertEvidenceTraceability, extractEvidence } from "../src/research.js";
import { collectThemesWithReviewIssues, reviewEvidence } from "../src/review.js";
import { buildResearchAnalystAgentManifest, SOURCE_TOOL_BINDING } from "../src/runtime.js";
import {
  APPROVAL_NODE,
  COLLECT_NODE,
  PLAN_NODE,
  REPORT_NODE,
  REVIEW_NODE,
  WORKFLOW_STAGE_ORDER,
  buildWorkflowDefinition,
} from "../src/workflow.js";

const demoRequest = {
  researchId: "research-test",
  question: DEFAULT_RESEARCH_QUESTION,
  objective: "Strategy brief",
  audience: "Leadership",
};

function runFixturePipeline() {
  const plan = createResearchPlan(demoRequest);
  const sources = searchFixtureSources(demoRequest.question);
  const evidence = extractEvidence(sources, plan);
  const initialAnalysis = synthesizeThemes(evidence, plan);
  const review = reviewEvidence(plan, evidence, initialAnalysis);
  const analysis = applyReviewAdjustments(initialAnalysis, collectThemesWithReviewIssues(review));
  const markdown = renderResearchReportMarkdown({
    request: demoRequest,
    plan,
    sources,
    evidence,
    analysis,
    review,
  });
  return { plan, sources, evidence, initialAnalysis, review, analysis, markdown };
}

describe("research analyst worker public contracts", () => {
  it("validates research request input bounds", () => {
    expect(validateResearchWorkerInput({ question: DEFAULT_RESEARCH_QUESTION })).toEqual({
      question: DEFAULT_RESEARCH_QUESTION,
    });
    expect(() => validateResearchWorkerInput({ question: "short" })).toThrow(/12 characters/);
    expect(() => validateResearchWorkerInput({ question: "x".repeat(501) })).toThrow(/500 characters/);
  });

  it("collects fixture sources through the MCP search handler", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const result = await executeSearchSources({ query: "AI customer support mid-market SaaS" });
    write.mockRestore();
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.length).toBeLessThanOrEqual(RESEARCH_CORPUS.length);
  });

  it("generates a structured research plan", () => {
    const plan = createResearchPlan(demoRequest);
    expect(plan.researchQuestion).toBe(demoRequest.question);
    expect(plan.subQuestions.length).toBeGreaterThanOrEqual(3);
    expect(plan.evidenceNeeded).toContain("implementation-concerns");
  });

  it("extracts traceable evidence records from sources", () => {
    const plan = createResearchPlan(demoRequest);
    const sources = searchFixtureSources(demoRequest.question);
    const evidence = extractEvidence(sources, plan);
    expect(evidence.length).toBeGreaterThan(0);
    expect(() => assertEvidenceTraceability(evidence, sources)).not.toThrow();
    for (const record of evidence) {
      expect(sources.some((source) => source.id === record.sourceId)).toBe(true);
    }
  });

  it("applies rule-based theme confidence without numeric scores", () => {
    const { evidence, plan } = runFixturePipeline();
    const analysis = synthesizeThemes(evidence, plan);
    const business = analysis.themes.find((theme) => theme.name === "Business pressure");
    expect(business?.confidence).toMatch(/high|medium|low/);
    expect(JSON.stringify(analysis)).not.toMatch(/0\.\d{2,}/);
  });

  it("preserves contradictory evidence and surfaces conflicts in review", () => {
    const { evidence, review, markdown } = runFixturePipeline();
    const vendor = evidence.find((item) => item.sourceId === "src-vendor-playbook");
    const advisory = evidence.find((item) => item.claim.includes("six to twelve months"));
    expect(vendor?.contradicts).toBeDefined();
    expect(advisory?.contradicts).toBeDefined();
    expect(review.issues.some((issue) => issue.type === "conflict")).toBe(true);
    expect(markdown).toContain("## Conflicting Evidence");
    expect(markdown).toContain("Conflicting claims");
  });

  it("flags coverage gaps relative to the research plan", () => {
    const plan = createResearchPlan(demoRequest);
    const sources = searchFixtureSources(demoRequest.question);
    const evidence = extractEvidence(sources, plan);
    const analysis = synthesizeThemes(evidence, plan);
    const review = reviewEvidence(plan, evidence, analysis);
    expect(review.issues.some((issue) => issue.type === "coverage-gap" || issue.type === "weak-evidence")).toBe(true);
  });

  it("downgrades confidence after evidence review for flagged themes", () => {
    const { initialAnalysis, review, analysis } = runFixturePipeline();
    const themeName = "Implementation concerns";
    const before = initialAnalysis.themes.find((theme) => theme.name === themeName);
    const after = analysis.themes.find((theme) => theme.name === themeName);
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    if (before === undefined || after === undefined) return;
    const rank = (value: string) => (value === "high" ? 3 : value === "medium" ? 2 : 1);
    expect(rank(after.confidence)).toBeLessThanOrEqual(rank(before.confidence));
    expect(review.issues.length).toBeGreaterThan(0);
  });

  it("renders a Markdown research report with source references", () => {
    const { markdown } = runFixturePipeline();
    expect(markdown).toMatch(/^# Research Report/);
    expect(markdown).toContain("## Key Findings");
    expect(markdown).toContain("## Sources");
    expect(markdown).toContain("src-saas-research-digest");
  });

  it("builds a multi-stage V3 workflow ending in approval and report nodes", () => {
    const definition = buildWorkflowDefinition("agent_version_test" as never);
    expect(() => workflowDefinitionSchema.parse(definition)).not.toThrow();
    expect(definition.nodes.map((node) => node.key)).toEqual([...WORKFLOW_STAGE_ORDER]);
    expect(definition.nodes.find((node) => node.key === APPROVAL_NODE)?.type).toBe("APPROVAL");
    expect(definition.nodes.find((node) => node.key === COLLECT_NODE)?.type).toBe("AGENT");
    expect(definition.nodes.find((node) => node.key === PLAN_NODE)?.type).toBe("AGENT");
    expect(definition.nodes.find((node) => node.key === REVIEW_NODE)?.type).toBe("AGENT");
    expect(definition.nodes.find((node) => node.key === REPORT_NODE)?.type).toBe("AGENT");
  });

  it("binds the research source tool in the agent manifest without credentials", () => {
    const manifest = buildResearchAnalystAgentManifest("http://127.0.0.1:8794/execute", "tool_version_test" as never);
    expect(manifest.capabilities.tools).toEqual([SOURCE_TOOL_BINDING]);
    expect(manifest.tools[SOURCE_TOOL_BINDING]).toEqual({ toolVersionId: "tool_version_test" });
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });
});
