import type { PageSnapshot } from "./types.js";

/** Deterministic demo page with intentional SEO gaps for the public example. */
export const DEMO_PAGE_URL = "https://example.test/products/cloud-backup";

export const demoPageFixture: PageSnapshot = {
  url: DEMO_PAGE_URL,
  title: "Backup Solutions",
  metaDescription: "We sell backup.",
  canonical: null,
  headings: [
    { level: 1, text: "Enterprise Backup Solutions" },
    { level: 3, text: "Why teams choose us" },
    { level: 2, text: "Features" },
  ],
  bodyText: [
    "Enterprise backup solutions for growing companies.",
    "Our platform helps teams protect critical data with automated scheduling.",
    "Compare plans and start a trial when you are ready.",
  ].join(" "),
  links: [
    { href: "https://example.test/pricing", text: "Pricing", internal: true },
    { href: "https://example.test/", text: "Home", internal: true },
    { href: "https://external-vendor.example/docs", text: "Vendor docs", internal: false },
  ],
  images: [
    { src: "/assets/hero.jpg", alt: "Dashboard screenshot" },
    { src: "/assets/icon.svg", alt: null },
    { src: "/assets/team.jpg", alt: "" },
  ],
  robotsMeta: "index,follow",
  structuredDataTypes: [],
  stats: {
    wordCount: 28,
    internalLinkCount: 2,
    externalLinkCount: 1,
  },
};

const fixtureByUrl = new Map<string, PageSnapshot>([[normalizeUrl(DEMO_PAGE_URL), demoPageFixture]]);

export function resolveFixturePage(url: string): PageSnapshot {
  const normalized = normalizeUrl(url);
  const known = fixtureByUrl.get(normalized);
  if (known !== undefined) {
    return { ...known, url };
  }
  return buildGenericThinFixture(url);
}

export function normalizePageSnapshot(raw: unknown): PageSnapshot {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Page snapshot must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const url = requireString(record["url"], "url");
  const title = optionalString(record["title"]);
  const metaDescription = optionalString(record["metaDescription"]);
  const canonical = optionalString(record["canonical"]);
  const bodyText = requireString(record["bodyText"], "bodyText");
  const robotsMeta = optionalString(record["robotsMeta"]);
  const headings = parseHeadings(record["headings"]);
  const links = parseLinks(record["links"]);
  const images = parseImages(record["images"]);
  const structuredDataTypes = parseStringArray(record["structuredDataTypes"]);
  const stats = parseStats(record["stats"], links);

  return {
    url,
    title,
    metaDescription,
    canonical,
    headings,
    bodyText,
    links,
    images,
    robotsMeta,
    structuredDataTypes,
    stats,
  };
}

function buildGenericThinFixture(url: string): PageSnapshot {
  return {
    url,
    title: null,
    metaDescription: null,
    canonical: null,
    headings: [],
    bodyText: "Placeholder page content for unknown URLs in fixture mode.",
    links: [],
    images: [],
    robotsMeta: null,
    structuredDataTypes: [],
    stats: { wordCount: 8, internalLinkCount: 0, externalLinkCount: 0 },
  };
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url.trim().toLowerCase();
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Page snapshot field '${field}' must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error("Optional string fields must be string or null.");
  }
  return value;
}

function parseHeadings(value: unknown): PageSnapshot["headings"] {
  if (!Array.isArray(value)) {
    throw new Error("Page snapshot headings must be an array.");
  }
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`Heading at index ${index} must be an object.`);
    }
    const record = item as Record<string, unknown>;
    const level = record["level"];
    const text = record["text"];
    if (typeof level !== "number" || level < 1 || level > 6 || !Number.isInteger(level)) {
      throw new Error(`Heading at index ${index} has an invalid level.`);
    }
    if (typeof text !== "string") {
      throw new Error(`Heading at index ${index} must include text.`);
    }
    return { level: level as 1 | 2 | 3 | 4 | 5 | 6, text };
  });
}

function parseLinks(value: unknown): PageSnapshot["links"] {
  if (!Array.isArray(value)) {
    throw new Error("Page snapshot links must be an array.");
  }
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`Link at index ${index} must be an object.`);
    }
    const record = item as Record<string, unknown>;
    const href = record["href"];
    const text = record["text"];
    const internal = record["internal"];
    if (typeof href !== "string" || typeof text !== "string" || typeof internal !== "boolean") {
      throw new Error(`Link at index ${index} is missing href, text, or internal flag.`);
    }
    return { href, text, internal };
  });
}

function parseImages(value: unknown): PageSnapshot["images"] {
  if (!Array.isArray(value)) {
    throw new Error("Page snapshot images must be an array.");
  }
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`Image at index ${index} must be an object.`);
    }
    const record = item as Record<string, unknown>;
    const src = record["src"];
    if (typeof src !== "string") {
      throw new Error(`Image at index ${index} must include src.`);
    }
    const altRaw = record["alt"];
    let alt: string | null = null;
    if (altRaw !== null && altRaw !== undefined) {
      if (typeof altRaw !== "string") {
        throw new Error(`Image at index ${index} alt must be string or null.`);
      }
      alt = altRaw;
    }
    return { src, alt };
  });
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("structuredDataTypes must be an array.");
  }
  return value.map((item) => {
    if (typeof item !== "string") {
      throw new Error("structuredDataTypes entries must be strings.");
    }
    return item;
  });
}

function parseStats(value: unknown, links: PageSnapshot["links"]): PageSnapshot["stats"] {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const wordCount = record["wordCount"];
    const internalLinkCount = record["internalLinkCount"];
    const externalLinkCount = record["externalLinkCount"];
    if (
      typeof wordCount === "number" &&
      typeof internalLinkCount === "number" &&
      typeof externalLinkCount === "number"
    ) {
      return { wordCount, internalLinkCount, externalLinkCount };
    }
  }
  const internalLinkCount = links.filter((link) => link.internal).length;
  const externalLinkCount = links.length - internalLinkCount;
  return { wordCount: 0, internalLinkCount, externalLinkCount };
}
