import assert from "node:assert/strict";
import { accessSync, constants as fsConstants } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { resolveNpmCliJs, resolveSpawnInvocation, runCommand } from "../lib/run-command.mjs";

/**
 * @param {string} filePath
 */
function readableNpmCli(filePath) {
  try {
    accessSync(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

describe("resolveSpawnInvocation", () => {
  it("on Windows resolves bare npm to node + npm-cli.js without shell", () => {
    if (process.platform !== "win32") {
      return;
    }
    const invocation = resolveSpawnInvocation("npm", ["--version"]);
    assert.equal(invocation.command, process.execPath);
    assert.ok(invocation.args.length >= 2);
    assert.match(invocation.args[0], /npm-cli\.js$/i);
    assert.deepEqual(invocation.args.slice(1), ["--version"]);
    assert.ok(readableNpmCli(invocation.args[0]));
  });

  it("rejects direct .cmd spawn on Windows", () => {
    if (process.platform !== "win32") {
      return;
    }
    assert.throws(
      () => resolveSpawnInvocation(String.raw`C:\Program Files\nodejs\npm.cmd`, ["--version"]),
      /Refusing to spawn Windows batch shim/,
    );
  });

  it("passes through node and path-qualified executables unchanged", () => {
    const nodeInvocation = resolveSpawnInvocation(process.execPath, ["-v"]);
    assert.equal(nodeInvocation.command, process.execPath);
    assert.deepEqual(nodeInvocation.args, ["-v"]);

    if (process.platform === "win32") {
      const qualified = resolveSpawnInvocation(String.raw`C:\tools\custom-npm.js`, ["install"]);
      assert.equal(qualified.command, String.raw`C:\tools\custom-npm.js`);
      assert.deepEqual(qualified.args, ["install"]);
    }
  });
});

describe("runCommand (cross-platform)", () => {
  it("runs npm without spawn EINVAL on Windows and without DEP0190 shell spawn", async () => {
    const result = await runCommand("npm", ["--version"]);
    assert.equal(result.code, 0);
    assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
  });

  it("preserves argument arrays and avoids shell metacharacter interpretation", async () => {
    const marker = process.platform === "win32" ? "a&b| c" : "a&b";
    const parent = await mkdtemp(path.join(os.tmpdir(), "osva-m19-argv-"));
    const echoScript = path.join(parent, "echo-argv.mjs");
    await writeFile(echoScript, "console.log(JSON.stringify(process.argv.slice(2)));\n", "utf8");
    try {
      const result = await runCommand(process.execPath, [echoScript, marker, "--flag=value"]);
      assert.equal(result.code, 0);
      const argv = JSON.parse(result.stdout.trim());
      assert.deepEqual(argv, [marker, "--flag=value"]);
    } finally {
      await rm(parent, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("supports working directories whose paths contain spaces", async () => {
    const parent = path.join(os.tmpdir(), "osva m19 run-command");
    await rm(parent, { recursive: true, force: true }).catch(() => {});
    await mkdir(parent, { recursive: true });
    const cwd = await mkdtemp(path.join(parent, "case-"));
    try {
      const result = await runCommand(process.execPath, ["-e", "console.log(process.cwd())"], { cwd });
      assert.equal(result.code, 0);
      assert.equal(result.stdout.trim(), cwd);
    } finally {
      await rm(parent, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("resolveNpmCliJs finds npm-cli.js adjacent to the current Node binary", () => {
    const npmCli = resolveNpmCliJs();
    assert.match(npmCli, /npm-cli\.js$/i);
    assert.ok(readableNpmCli(npmCli));
  });
});
