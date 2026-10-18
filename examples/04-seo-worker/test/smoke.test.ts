import { workflowDefinitionSchema } from "@osva-ai/contracts/schemas";
import { describe, expect, it, vi } from "vitest";

import { executeFetchPage } from "../src/connector.js";
import { demoPageFixture, normalizePageSnapshot } from "../src/fixtures.js";
import { validateSeoWorkerInput } from "../src/input.js";
import { analyzePageSeo, prioritizeRecommendations, recommendationScore, renderMarkdownAudit } from "../src/seo.js";
import { buildSeoWorkerAgentManifest, PAGE_TOOL_BINDING } from "../src/runtime.js";
import { ANALYZE_NODE, APPROVAL_NODE, buildWorkflowDefinition, INSPECT_NODE, REPORT_NODE } from "../src/workflow.js";

describe("SEO worker public contracts", () => {
  it("validates structured SEO worker input", () => {
    expect(
      validateSeoWorkerInput({
        url: "https://example.test/page",
        targetKeyword: "cloud backup",
        businessContext: " B2B SaaS ",
      }),
    ).toEqual({
      url: "https://example.test/page",
      targetKeyword: "cloud backup",
      businessContext: "B2B SaaS",
    });
    expect(() => validateSeoWorkerInput({ url: "not-a-url", targetKeyword: "x" })).toThrow(/absolute URL/);
    expect(() => validateSeoWorkerInput({ url: "https://example.test", targetKeyword: "a" })).toThrow(/2 characters/);
  });

  it("parses fixture page snapshots", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const result = await executeFetchPage({ url: demoPageFixture.url });
    write.mockRestore();
    const page = normalizePageSnapshot(result.page);
    expect(page.url).toBe(demoPageFixture.url);
    expect(page.headings.some((heading) => heading.level === 1)).toBe(true);
  });

  it("emits deterministic SEO findings for the demo fixture", () => {
    const audit = analyzePageSeo(demoPageFixture, {
      auditId: "audit-test",
      url: demoPageFixture.url,
      targetKeyword: "cloud backup software",
      businessContext: "B2B SaaS",
    });
    const ids = audit.recommendations.map((item) => item.id);
    expect(ids).toContain("tech-canonical-missing");
    expect(ids).toContain("onpage-keyword-title");
    expect(ids).toContain("content-thin");
    expect(ids).toContain("links-internal-count");
    expect(audit.summary).toMatch(/Rule-based review found/);
  });

  it("orders recommendations by deterministic priority score", () => {
    const sample = analyzePageSeo(demoPageFixture, {
      auditId: "audit-test",
      url: demoPageFixture.url,
      targetKeyword: "cloud backup software",
    });
    const sorted = prioritizeRecommendations(sample.recommendations);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous === undefined || current === undefined) continue;
      const delta = recommendationScore(previous) - recommendationScore(current);
      expect(delta).toBeGreaterThanOrEqual(0);
      if (delta === 0) {
        expect(previous.id.localeCompare(current.id)).toBeLessThanOrEqual(0);
      }
    }
  });

  it("renders a Markdown audit artifact payload", () => {
    const request = {
      auditId: "audit-test",
      url: demoPageFixture.url,
      targetKeyword: "cloud backup software",
    };
    const audit = analyzePageSeo(demoPageFixture, request);
    const markdown = renderMarkdownAudit(request, demoPageFixture, audit);
    expect(markdown).toMatch(/^# SEO Audit/);
    expect(markdown).toContain("## Technical Findings");
    expect(markdown).toContain("tech-canonical-missing");
    expect(markdown).toContain("Target keyword: cloud backup software");
  });

  it("builds a V3 inspect-analyze-approval-report workflow", () => {
    const definition = buildWorkflowDefinition("agent_version_test" as never);
    expect(() => workflowDefinitionSchema.parse(definition)).not.toThrow();
    expect(definition.nodes.map((node) => node.key)).toEqual([INSPECT_NODE, ANALYZE_NODE, APPROVAL_NODE, REPORT_NODE]);
    expect(definition.nodes.map((node) => node.type)).toEqual(["AGENT", "AGENT", "APPROVAL", "AGENT"]);
    const approval = definition.nodes.find((node) => node.key === APPROVAL_NODE);
    expect(approval).toMatchObject({ type: "APPROVAL" });
  });

  it("binds the page inspection tool in the agent manifest without credentials", () => {
    const manifest = buildSeoWorkerAgentManifest("http://127.0.0.1:8792/execute", "tool_version_test" as never);
    expect(manifest.capabilities.tools).toEqual([PAGE_TOOL_BINDING]);
    expect(manifest.tools[PAGE_TOOL_BINDING]).toEqual({ toolVersionId: "tool_version_test" });
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });
});
