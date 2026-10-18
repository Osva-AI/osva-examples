import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", "dist", "coverage", ".pnpm-store", ".git"]);
const patterns = [
  { name: "OSVA API key", regex: /osva_ak_[A-Za-z0-9_-]{16,}/g },
  { name: "OpenAI-style secret", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "authorization bearer token", regex: /authorization\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._~-]{20,}/gi },
];
const failures = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }
    const statName = path.relative(ROOT, full);
    let content;
    try {
      content = await readFile(full, "utf8");
    } catch {
      continue;
    }
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(content)) failures.push(`${statName}: ${pattern.name}`);
    }
  }
}

await walk(ROOT);
if (failures.length > 0) {
  process.stderr.write(`Potential secrets detected:\n${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Lightweight secret scan passed.\n");
}
