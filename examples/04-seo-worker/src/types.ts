export interface SeoWorkerInput {
  readonly url: string;
  readonly targetKeyword: string;
  readonly businessContext?: string;
}

export interface SeoWorkerRequest extends SeoWorkerInput {
  readonly auditId: string;
}

export type SeoCategory = "technical" | "on-page" | "content" | "internal-linking";

export type SeoPriorityLevel = "high" | "medium" | "low";

export interface SeoRecommendation {
  readonly id: string;
  readonly category: SeoCategory;
  readonly severity: SeoPriorityLevel;
  readonly impact: SeoPriorityLevel;
  readonly effort: SeoPriorityLevel;
  readonly finding: string;
  readonly recommendation: string;
  readonly evidence?: string;
}

export interface PageHeading {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
}

export interface PageLink {
  readonly href: string;
  readonly text: string;
  readonly internal: boolean;
}

export interface PageImage {
  readonly src: string;
  readonly alt: string | null;
}

export interface PageSnapshot {
  readonly url: string;
  readonly title: string | null;
  readonly metaDescription: string | null;
  readonly canonical: string | null;
  readonly headings: readonly PageHeading[];
  readonly bodyText: string;
  readonly links: readonly PageLink[];
  readonly images: readonly PageImage[];
  readonly robotsMeta: string | null;
  readonly structuredDataTypes: readonly string[];
  readonly stats: {
    readonly wordCount: number;
    readonly internalLinkCount: number;
    readonly externalLinkCount: number;
  };
}

export interface SeoAuditResult {
  readonly recommendations: readonly SeoRecommendation[];
  readonly summary: string;
}
