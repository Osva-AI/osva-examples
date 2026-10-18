import { workflowDefinitionSchema } from "@osva-ai/contracts/schemas";
import { describe, expect, it } from "vitest";

import { buildReviewAgentManifest } from "../src/runtime.js";
import { buildWorkflowDefinition, EVENT_SOURCE, EVENT_TYPE, WAIT_NODE } from "../src/workflow.js";

describe("durable review workflow public contracts", () => {
  it("builds a stable V3 approval and event-wait workflow", () => {
    const definition = buildWorkflowDefinition("agent_version_test" as never);
    expect(() => workflowDefinitionSchema.parse(definition)).not.toThrow();
    expect(definition.nodes.map((node) => node.type)).toEqual(["AGENT", "AGENT", "APPROVAL", "WAIT", "AGENT"]);
    const wait = definition.nodes.find((node) => node.key === WAIT_NODE);
    expect(wait).toMatchObject({
      type: "WAIT",
      wait: {
        kind: "EVENT",
        source: EVENT_SOURCE,
        eventType: EVENT_TYPE,
        correlation: { kind: "INPUT_POINTER", pointer: "/request/requestId" },
      },
    });
  });

  it("keeps the remote runtime manifest free of credentials", () => {
    const manifest = buildReviewAgentManifest("http://127.0.0.1:8790/execute");
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });
});
