import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import path from "node:path";

import { redactSecrets } from "./redact.mjs";

/**
 * @param {string} filePath
 * @returns {string | undefined}
 */
function readableFile(filePath) {
  try {
    accessSync(filePath, fsConstants.R_OK);
    return filePath;
  } catch {
    return undefined;
  }
}

/**
 * @param {string} filePath
 */
function isNpmCliJsPath(filePath) {
  return path.basename(filePath).toLowerCase() === "npm-cli.js";
}

/**
 * Resolve npm's JavaScript CLI entrypoint (never a `.cmd` shim).
 *
 * @returns {string}
 */
export function resolveNpmCliJs() {
  /** @type {string[]} */
  const tried = [];

  const fromEnv = process.env.npm_execpath?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0 && isNpmCliJsPath(fromEnv)) {
    tried.push(fromEnv);
    const resolved = readableFile(fromEnv);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  const nodeBinary = process.env.npm_node_execpath?.trim() || process.execPath;
  const bundled = path.normalize(path.join(path.dirname(nodeBinary), "node_modules", "npm", "bin", "npm-cli.js"));
  tried.push(bundled);
  const bundledResolved = readableFile(bundled);
  if (bundledResolved !== undefined) {
    return bundledResolved;
  }

  const prefix = process.env.NPM_PREFIX?.trim();
  if (prefix !== undefined && prefix.length > 0) {
    const fromPrefix = path.join(prefix, "node_modules", "npm", "bin", "npm-cli.js");
    tried.push(fromPrefix);
    const prefixResolved = readableFile(fromPrefix);
    if (prefixResolved !== undefined) {
      return prefixResolved;
    }
  }

  throw new Error(
    [
      "Could not resolve npm CLI entrypoint (npm-cli.js).",
      "Install Node.js with bundled npm, or ensure npm is on PATH.",
      `Tried: ${tried.join("; ")}`,
    ].join(" "),
  );
}

/**
 * Map a logical command to a spawn target that avoids shell execution on Windows.
 *
 * @param {string} command
 * @param {string[]} args
 * @returns {{ command: string, args: string[] }}
 */
export function resolveSpawnInvocation(command, args) {
  const isBareName = !command.includes("/") && !command.includes("\\");

  if (process.platform === "win32" && isBareName && command.toLowerCase() === "npm") {
    const npmCli = resolveNpmCliJs();
    const nodeBinary = process.env.npm_node_execpath?.trim() || process.execPath;
    return { command: nodeBinary, args: [npmCli, ...args] };
  }

  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command)) {
    throw new Error(
      `Refusing to spawn Windows batch shim "${command}" with shell disabled (spawn EINVAL). ` +
        'Use bare "npm" or invoke a .js entrypoint via process.execPath.',
    );
  }

  return { command, args };
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 */
export function runCommand(command, args, options = {}) {
  const invocation = resolveSpawnInvocation(command, args);

  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(stderr),
      });
    });
  });
}
