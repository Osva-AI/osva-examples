import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = path.join(ROOT, "scripts", "acceptance", "b6-2-published-connector", "verify-example-20-pins.mjs");

function runVerify() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const result = await runVerify();
assert.equal(result.code, 0, `verify-example-20-pins failed:\n${result.stderr}\n${result.stdout}`);
