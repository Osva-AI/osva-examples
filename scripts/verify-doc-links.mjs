import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", "dist", "coverage", ".pnpm-store", ".git"]);
const markdownFiles = [];
const failures = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name.endsWith(".md")) markdownFiles.push(full);
  }
}

await walk(ROOT);
for (const file of markdownFiles) {
  const content = await readFile(file, "utf8");
  const links = [...content.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const raw of links) {
    if (!raw || /^(?:https?:|mailto:|#)/i.test(raw)) continue;
    const target = raw.split("#", 1)[0];
    if (!target) continue;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
    try {
      await access(resolved);
    } catch {
      failures.push(`${path.relative(ROOT, file)} -> ${raw}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`Broken relative Markdown links:\n${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Documentation link validation passed (${markdownFiles.length} Markdown files).\n`);
}
