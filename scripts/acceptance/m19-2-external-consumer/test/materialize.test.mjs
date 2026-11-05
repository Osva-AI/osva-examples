import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, after } from "node:test";

import { materializeExample19Consumer } from "../lib/materialize-consumer.mjs";
import { verifyNoWorkspaceImports } from "../lib/verify-no-workspace.mjs";

describe("materialize Example 19 consumer", () => {
  /** @type {string | undefined} */
  let tempDir;

  after(async () => {
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rewrites utils imports and avoids workspace dependencies", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "m19-2-materialize-"));
    await materializeExample19Consumer(tempDir);

    const pkg = JSON.parse(await readFile(path.join(tempDir, "package.json"), "utf8"));
    assert.equal(pkg.dependencies["@osva-ai/sdk"], "1.1.4");
    assert.equal(pkg.dependencies["@osva-examples/utils"], undefined);

    const appSource = await readFile(path.join(tempDir, "src", "app.ts"), "utf8");
    assert.match(appSource, /\.\/_osva-example-utils\/index\.js/);
    assert.doesNotMatch(appSource, /@osva-examples\/utils/);

    const scan = await verifyNoWorkspaceImports(tempDir);
    assert.equal(scan.ok, true, scan.violations.join("\n"));
  });
});
