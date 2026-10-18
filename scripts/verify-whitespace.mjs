import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", "dist", "coverage", ".pnpm-store", ".git"]);
const TEXT_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".json", ".md", ".yaml", ".yml", ".txt", ".npmrc"]);

const failures = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }
    const extension = path.extname(entry.name);
    if (!TEXT_EXTENSIONS.has(extension) && !entry.name.startsWith(".")) continue;
    const content = await readFile(full, "utf8");
    const relative = path.relative(ROOT, full);
    if (content.includes("\r")) failures.push(`${relative}: contains CR characters`);
    if (!content.endsWith("\n")) failures.push(`${relative}: missing final newline`);
    content.split("\n").forEach((line, index) => {
      if (/[ \t]+$/.test(line)) failures.push(`${relative}:${index + 1}: trailing whitespace`);
    });
  }
}

await walk(ROOT);
if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Whitespace validation passed.\n");
}
