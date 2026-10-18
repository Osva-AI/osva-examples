import type { ResearchPlan, ResearchWorkerRequest } from "./types.js";

export function createResearchPlan(request: ResearchWorkerRequest): ResearchPlan {
  const researchQuestion = request.question;
  return {
    researchQuestion,
    subQuestions: [
      "What business pressures are pushing mid-market SaaS teams toward AI support agents?",
      "Which operational benefits do stakeholders expect from automation?",
      "What implementation or governance concerns slow or complicate adoption?",
      "Which themes recur across independent synthetic sources in the fixture corpus?",
    ],
    evidenceNeeded: [
      "business-pressure",
      "operational-benefits",
      "implementation-concerns",
      "stakeholder-alignment",
      "cross-source consistency",
    ],
  };
}
