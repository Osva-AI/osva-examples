import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface PythonRuntimeProcess {
  readonly close: () => Promise<void>;
}

export async function startPythonRuntime(options: {
  readonly host: string;
  readonly port: number;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<PythonRuntimeProcess> {
  const launch = await resolvePythonLaunch(options.env ?? process.env);
  const scriptPath = path.join(PACKAGE_ROOT, "python", "agent.py");
  const child = spawn(
    launch.command,
    [...launch.prefixArgs, scriptPath, "--host", options.host, "--port", String(options.port)],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env,
    },
  );

  try {
    await waitForReady(child, options.host, options.port);
  } catch (error) {
    await terminateChild(child);
    throw error;
  }

  return {
    close: async () => {
      await terminateChild(child);
    },
  };
}

interface PythonLaunch {
  readonly command: string;
  readonly prefixArgs: readonly string[];
}

export async function resolvePythonLaunch(env: NodeJS.ProcessEnv = process.env): Promise<PythonLaunch> {
  const override = env.OSVA_EXAMPLE_PYTHON?.trim();
  if (override !== undefined && override.length > 0) {
    return { command: override, prefixArgs: [] };
  }

  const candidates: readonly PythonLaunch[] =
    process.platform === "win32"
      ? [
          { command: "py", prefixArgs: ["-3"] },
          { command: "python", prefixArgs: [] },
          { command: "python3", prefixArgs: [] },
        ]
      : [
          { command: "python3", prefixArgs: [] },
          { command: "python", prefixArgs: [] },
        ];

  for (const candidate of candidates) {
    const ok = await probeExecutable(candidate.command, [...candidate.prefixArgs, "--version"], env);
    if (ok) {
      return candidate;
    }
  }

  throw new Error(
    "Python 3 was not found on PATH. Install Python 3.11+ or set OSVA_EXAMPLE_PYTHON to the interpreter path.",
  );
}

async function probeExecutable(command: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { stdio: "ignore", env });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function waitForReady(child: ChildProcess, host: string, port: number): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("Python runtime exited before becoming ready.");
    }

    try {
      const response = await fetch(`http://${host}:${String(port)}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ protocolVersion: "probe" }),
      });
      if (response.status === 400 || response.status === 404) {
        return;
      }
    } catch {
      // retry until deadline
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for the Python runtime to listen.");
}

async function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill();
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 3_000))]);
}
