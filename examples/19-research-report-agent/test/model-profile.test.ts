import { describe, expect, it, vi } from "vitest";

import type { OsvaClient } from "@osva-ai/sdk";

import { resolveModelProfileVersionId } from "../src/model-profile.js";

const modelEnv = {
  OSVA_EXAMPLE_MODEL_ID: "gpt-4o-mini",
  OSVA_EXAMPLE_MODEL_PROVIDER: "OPENAI",
};

function mockModelProfileClient() {
  const create = vi.fn().mockResolvedValue({ id: "model_profile_1" });
  const createVersion = vi.fn().mockResolvedValue({ id: "model_profile_version_1" });
  const client = { modelProfiles: { create, createVersion } } as unknown as OsvaClient;
  return { client, create, createVersion };
}

describe("resolveModelProfileVersionId", () => {
  it("returns OSVA_MODEL_PROFILE_VERSION_ID without creating a model profile", async () => {
    const { client, create, createVersion } = mockModelProfileClient();

    const versionId = await resolveModelProfileVersionId(client, "ignored-suffix", {
      ...modelEnv,
      OSVA_MODEL_PROFILE_VERSION_ID: "mpv_from_console",
    });

    expect(versionId).toBe("mpv_from_console");
    expect(create).not.toHaveBeenCalled();
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("POSTs model profile create with the run suffix in key and name", async () => {
    const { client, create, createVersion } = mockModelProfileClient();
    const suffix = "stable-suffix";

    await resolveModelProfileVersionId(client, suffix, modelEnv);

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      key: `examples-research-model-${suffix}`,
      name: `Examples Research Model ${suffix}`,
    });
    expect(createVersion).toHaveBeenCalledOnce();
    expect(createVersion).toHaveBeenCalledWith("model_profile_1", {
      provider: "OPENAI",
      model: "gpt-4o-mini",
    });
  });

  it("uses the provided run suffix instead of a stable workspace id tail", async () => {
    const { client, create } = mockModelProfileClient();
    const workspaceTail = "workspace_abcdef12".slice(-8);
    const runSuffix = "7f3a9b2c";

    await resolveModelProfileVersionId(client, runSuffix, modelEnv);

    expect(create).toHaveBeenCalledWith({
      key: `examples-research-model-${runSuffix}`,
      name: `Examples Research Model ${runSuffix}`,
    });
    expect(runSuffix).not.toBe(workspaceTail);
  });

  it("creates distinct model profile keys for distinct run suffixes", async () => {
    const first = mockModelProfileClient();
    const second = mockModelProfileClient();

    await resolveModelProfileVersionId(first.client, "aaaa1111", modelEnv);
    await resolveModelProfileVersionId(second.client, "bbbb2222", modelEnv);

    expect(first.create.mock.calls[0]?.[0]).toEqual({
      key: "examples-research-model-aaaa1111",
      name: "Examples Research Model aaaa1111",
    });
    expect(second.create.mock.calls[0]?.[0]).toEqual({
      key: "examples-research-model-bbbb2222",
      name: "Examples Research Model bbbb2222",
    });
  });
});

describe("example 19 per-run resource keys", () => {
  it("aligns agent, npm tool, and model profile keys on the same suffix", () => {
    const suffix = "shared-run-key";

    expect(`examples-research-report-${suffix}`).toBe("examples-research-report-shared-run-key");
    expect(`examples-npm-metadata-${suffix}`).toBe("examples-npm-metadata-shared-run-key");
    expect(`examples-npm-downloads-${suffix}`).toBe("examples-npm-downloads-shared-run-key");
    expect(`examples-research-model-${suffix}`).toBe("examples-research-model-shared-run-key");
  });
});
