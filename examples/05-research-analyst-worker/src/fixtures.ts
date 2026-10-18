import type { JsonValue } from "@osva-ai/contracts";
import { isJsonRecord } from "@osva-examples/utils";

import type { ResearchSource } from "./types.js";

/** Synthetic corpus for deterministic research — not live web results. */
export const RESEARCH_CORPUS: readonly ResearchSource[] = [
  {
    id: "src-saas-research-digest",
    title: "Mid-Market SaaS Support Automation Signals (Synthetic Digest)",
    publisher: "OSVA Examples Research Desk",
    publishedAt: "2025-06-01",
    url: "https://research.example.test/reports/mid-market-support-automation",
    content:
      "Mid-market SaaS teams report rising ticket volume and tighter staffing budgets. " +
      "Leaders cite first-response time and cost-per-ticket as primary KPIs when evaluating AI support agents.",
    snippets: [
      {
        claim: "Ticket volume growth and flat support headcount are primary business pressures.",
        theme: "business-pressure",
        strength: "strong",
        stance: "support",
      },
      {
        claim: "First-response time and cost-per-ticket dominate vendor selection criteria.",
        theme: "operational-benefits",
        strength: "moderate",
        stance: "support",
      },
    ],
  },
  {
    id: "src-ops-leaders-survey",
    title: "Operations Leaders Survey — Support Automation (Synthetic)",
    publisher: "Example Benchmark Panel",
    publishedAt: "2025-05-12",
    url: "https://panel.example.test/surveys/support-automation-2025",
    content:
      "Survey respondents expect deflection of repetitive tier-1 questions and faster routing to specialists. " +
      "Several teams note change-management effort for macros, knowledge bases, and QA review.",
    snippets: [
      {
        claim: "Teams expect tier-1 deflection and faster specialist routing from AI agents.",
        theme: "operational-benefits",
        strength: "strong",
        stance: "support",
      },
      {
        claim: "Knowledge-base cleanup and QA review slow rollout timelines.",
        theme: "implementation-concerns",
        strength: "moderate",
        stance: "caution",
      },
    ],
  },
  {
    id: "src-vendor-playbook",
    title: "CloudHelp Vendor Playbook — Instant AI Rollout (Synthetic)",
    publisher: "CloudHelp Marketing",
    publishedAt: "2025-04-20",
    url: "https://vendor.example.test/playbooks/instant-ai",
    content:
      "Marketing narrative suggests most customers deploy production AI support agents within two weeks with minimal integration work.",
    snippets: [
      {
        claim: "Production AI support agents can launch within two weeks with minimal integration.",
        theme: "implementation-concerns",
        strength: "weak",
        stance: "support",
      },
    ],
  },
  {
    id: "src-buyer-advisory",
    title: "Buyer Advisory Notes — Support AI Programs (Synthetic)",
    publisher: "Example Advisory Group",
    publishedAt: "2025-05-28",
    url: "https://advisory.example.test/notes/support-ai",
    content:
      "Advisors warn that realistic integration, governance, and human handoff design typically require six to twelve months " +
      "for mid-market SaaS companies with heterogeneous CRM and billing stacks.",
    snippets: [
      {
        claim: "Realistic integration and governance cycles often span six to twelve months.",
        theme: "implementation-concerns",
        strength: "moderate",
        stance: "caution",
      },
      {
        claim: "Human handoff design remains a gating factor for safe automation.",
        theme: "implementation-concerns",
        strength: "strong",
        stance: "caution",
      },
    ],
  },
  {
    id: "src-peer-benchmark",
    title: "Peer Benchmark Memo — Cost Containment (Synthetic)",
    publisher: "Example Peer Network",
    publishedAt: "2025-03-15",
    content:
      "Peer companies consistently rank labor cost containment and scalable coverage as reasons to pilot AI support agents.",
    snippets: [
      {
        claim: "Labor cost containment and scalable coverage motivate AI support pilots.",
        theme: "business-pressure",
        strength: "moderate",
        stance: "support",
      },
    ],
  },
];

export function searchFixtureSources(query: string): readonly ResearchSource[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return RESEARCH_CORPUS;
  }
  const scored = RESEARCH_CORPUS.map((source) => ({
    source,
    score: scoreSource(source, tokens),
  }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.source.id.localeCompare(right.source.id));
  if (scored.length === 0) {
    return RESEARCH_CORPUS;
  }
  return scored.map((entry) => entry.source);
}

export function normalizeResearchSource(raw: JsonValue): ResearchSource {
  if (!isJsonRecord(raw)) {
    throw new Error("Research source must be an object.");
  }
  const id = requireString(raw["id"], "id");
  const title = requireString(raw["title"], "title");
  const publisher = requireString(raw["publisher"], "publisher");
  const content = requireString(raw["content"], "content");
  const publishedAt = optionalString(raw["publishedAt"]);
  const url = optionalString(raw["url"]);
  const snippetsRaw = raw["snippets"];
  const snippets =
    snippetsRaw === undefined
      ? []
      : Array.isArray(snippetsRaw)
        ? snippetsRaw.map((item, index) => parseSnippet(item, index))
        : [];
  return {
    id,
    title,
    publisher,
    content,
    ...(publishedAt === null ? {} : { publishedAt }),
    ...(url === null ? {} : { url }),
    snippets,
  };
}

export function normalizeResearchSources(raw: JsonValue): ResearchSource[] {
  if (!Array.isArray(raw)) {
    throw new Error("Sources must be an array.");
  }
  return raw.map((item) => normalizeResearchSource(item));
}

function parseSnippet(raw: JsonValue, index: number): ResearchSource["snippets"][number] {
  if (!isJsonRecord(raw)) {
    throw new Error(`Snippet at index ${index} must be an object.`);
  }
  return {
    claim: requireString(raw["claim"], "claim"),
    theme: requireString(raw["theme"], "theme"),
    strength: parseStrength(raw["strength"]),
    stance: parseStance(raw["stance"]),
  };
}

function parseStrength(value: unknown): ResearchSource["snippets"][number]["strength"] {
  if (value === "strong" || value === "moderate" || value === "weak") {
    return value;
  }
  throw new Error("Snippet strength must be strong, moderate, or weak.");
}

function parseStance(value: unknown): ResearchSource["snippets"][number]["stance"] {
  if (value === "support" || value === "caution" || value === "neutral") {
    return value;
  }
  throw new Error("Snippet stance must be support, caution, or neutral.");
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function scoreSource(source: ResearchSource, tokens: readonly string[]): number {
  const haystack = `${source.title} ${source.content} ${source.snippets.map((s) => s.theme).join(" ")}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 1;
    }
  }
  return score;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Source field '${field}' must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error("Optional source string fields must be string or null.");
  }
  return value;
}
