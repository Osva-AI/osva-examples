export const DEFAULT_RESEARCH_QUESTION =
  "What are the adoption drivers and risks for AI assistants in mid-market SaaS?";

export interface ResearchRequest {
  readonly researchId: string;
  readonly question: string;
}

export function validateResearchQuestion(question: string): string {
  const trimmed = question.trim();
  if (trimmed.length < 12) {
    throw new Error("Research question must be at least 12 characters.");
  }
  if (trimmed.length > 500) {
    throw new Error("Research question must be at most 500 characters.");
  }
  return trimmed;
}

export function buildResearchRequest(question: string, researchId: string): ResearchRequest {
  return { researchId, question: validateResearchQuestion(question) };
}
