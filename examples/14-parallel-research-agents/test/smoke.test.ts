import type { JsonObject } from "@osva-ai/contracts";
import { workflowDefinitionSchema } from "@osva-ai/contracts/schemas";
import { describe, expect, it } from "vitest";

import { collectBranchFindings } from "../src/fixtures.js";
import { validateResearchQuestion } from "../src/input.js";
import { buildRouteAgentManifest, runtimeEndpoint } from "../src/manifest.js";
import { renderParallelResearchMarkdown } from "../src/report.js";
import { executeRoute } from "../src/runtime.js";
import { synthesizeParallelResearch } from "../src/synthesis.js";
import { JOIN_NODE, MARKET_NODE, PARALLEL_NODE, buildWorkflowDefinition } from "../src/workflow.js";

describe("parallel research agents public contracts", () => {
  it("validates research question bounds", () => {
    expect(validateResearchQuestion("What are adoption drivers for AI assistants?")).toContain("AI assistants");
    expect(() => validateResearchQuestion("short")).toThrow(/12 characters/);
  });

  it("builds a Workflow V3 graph with PARALLEL and JOIN orchestration nodes", () => {
    const definition = buildWorkflowDefinition({
      plan: "agent_version_plan" as never,
      market: "agent_version_market" as never,
      competitor: "agent_version_competitor" as never,
      customer: "agent_version_customer" as never,
      synthesis: "agent_version_synthesis" as never,
      report: "agent_version_report" as never,
    });
    expect(() => workflowDefinitionSchema.parse(definition)).not.toThrow();
    expect(definition.nodes.find((node) => node.key === PARALLEL_NODE)?.type).toBe("PARALLEL");
    expect(definition.nodes.find((node) => node.key === JOIN_NODE)?.type).toBe("JOIN");
    expect(definition.edges.filter((edge) => edge.from === PARALLEL_NODE).map((edge) => edge.to)).toEqual([
      MARKET_NODE,
      "research-competitor",
      "research-customer",
    ]);
  });

  it("binds branch-specific REMOTE_HTTP endpoints without credentials", () => {
    const manifest = buildRouteAgentManifest("http://127.0.0.1:8795", "market", "Market Branch");
    expect(manifest.runtime.endpoint).toBe(runtimeEndpoint("http://127.0.0.1:8795", "market"));
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });

  it("produces distinct branch evidence from fixtures", () => {
    const question = "What are adoption drivers and risks for AI assistants in mid-market SaaS?";
    const market = collectBranchFindings(question, "market");
    const competitor = collectBranchFindings(question, "competitor");
    expect(market.findings[0]?.sourceId).not.toBe(competitor.findings[0]?.sourceId);
  });

  it("requires all branch outputs before synthesis and preserves traceability", async () => {
    const request = { researchId: "research-test", question: "What are adoption drivers for AI assistants?" };
    const branches = (["market", "competitor", "customer"] as const).map((branch) =>
      collectBranchFindings(request.question, branch),
    );
    const synthesis = synthesizeParallelResearch(request, branches);
    expect(synthesis.sections).toHaveLength(3);
    expect(synthesis.sections.every((section) => section.sourceIds.length > 0)).toBe(true);
    const markdown = renderParallelResearchMarkdown(request, synthesis);
    expect(markdown).toContain("fixture-market-digest");
    expect(markdown).toContain("fixture-competitor-map");
    expect(markdown).toContain("fixture-customer-interviews");
  });

  it("fails synthesis when a branch is missing", () => {
    const request = { researchId: "research-test", question: "What are adoption drivers for AI assistants?" };
    expect(() => synthesizeParallelResearch(request, [collectBranchFindings(request.question, "market")])).toThrow(
      /market, competitor, and customer/,
    );
  });

  it("merges branch results through the runtime envelope", async () => {
    const input = {
      request: { researchId: "research-test", question: "What are adoption drivers for AI assistants?" },
      plan: { subQuestions: ["a", "b", "c"] },
    };
    const market = await executeRoute("market", input);
    const competitor = await executeRoute("competitor", market);
    const customer = await executeRoute("customer", competitor);
    const synthesized = await executeRoute("synthesize", customer);
    expect(synthesized["synthesis"]).toBeDefined();
  });

  it("documents branch failure behavior when JOIN inputs are incomplete", async () => {
    const input = JSON.parse(
      JSON.stringify({
        request: { researchId: "research-test", question: "What are adoption drivers for AI assistants?" },
        branchResults: { market: collectBranchFindings("question", "market") },
      }),
    ) as JsonObject;
    await expect(executeRoute("synthesize", input)).rejects.toThrow(/JOIN output must include/);
  });
});
