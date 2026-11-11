#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const scripts = ["verify-example-20-pins.mjs", "verify-example-21-pins.mjs"];

let failed = false;
for (const script of scripts) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(HERE, script)], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0) failed = true;
}

process.exitCode = failed ? 1 : 0;
