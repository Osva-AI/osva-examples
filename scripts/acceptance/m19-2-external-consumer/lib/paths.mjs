import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../../..");

export const EXAMPLE_19_ROOT = path.join(REPO_ROOT, "examples", "19-research-report-agent");

export const EXAMPLE_UTILS_SRC = path.join(REPO_ROOT, "packages", "example-utils", "src");

export const DEFAULT_REPORT_DIR = path.join(REPO_ROOT, "artifacts", "acceptance", "m19-2");
