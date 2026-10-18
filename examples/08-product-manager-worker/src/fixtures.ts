import type {
  CustomerFeedback,
  ProductContext,
  ProductEvidenceBundle,
  ProductMetrics,
  SupportTicket,
} from "./types.js";

interface ProductFixture {
  readonly feedback: readonly CustomerFeedback[];
  readonly tickets: readonly SupportTicket[];
  readonly metrics: ProductMetrics;
  readonly context: ProductContext;
}

const FLOWTASK_PRO: ProductFixture = {
  feedback: [
    {
      id: "fb-001",
      customerSegment: "new-smb-admin",
      text: "I signed up but got stuck on the workspace setup wizard — unclear what a project vs workspace is.",
    },
    {
      id: "fb-002",
      customerSegment: "new-smb-admin",
      text: "Onboarding asks for integrations before I understand the core task flow.",
    },
    {
      id: "fb-003",
      customerSegment: "trial-user",
      text: "Could not find where to invite my team after signup; had to search the docs.",
    },
    {
      id: "fb-004",
      customerSegment: "trial-user",
      text: "The first-run checklist disappeared after I skipped a step and I could not get it back.",
    },
    {
      id: "fb-005",
      customerSegment: "power-user",
      text: "Please add dark mode — would love it for late night planning sessions.",
    },
    {
      id: "fb-006",
      customerSegment: "power-user",
      text: "Dark theme please!!! Everyone on my team keeps asking for dark mode.",
    },
    {
      id: "fb-007",
      customerSegment: "trial-user",
      text: "Pricing page mentions enterprise SSO but I just need simple team seats — confusing.",
    },
    {
      id: "fb-008",
      customerSegment: "new-smb-admin",
      text: "Setup wizard loops when I connect Slack — not sure if I finished onboarding.",
    },
    {
      id: "fb-009",
      customerSegment: "churned-trial",
      text: "Never activated because the empty dashboard did not show me a first task to create.",
    },
  ],
  tickets: [
    {
      id: "tkt-101",
      category: "onboarding",
      text: "Customer cannot complete onboarding — stuck on workspace naming step.",
    },
    {
      id: "tkt-102",
      category: "onboarding",
      text: "Skipped invite teammates step and now cannot find team settings.",
    },
    {
      id: "tkt-103",
      category: "navigation",
      text: "Where is the projects list after the UI update?",
    },
    {
      id: "tkt-104",
      category: "integrations",
      text: "Slack connection shows success but onboarding progress still at 40%.",
    },
    {
      id: "tkt-105",
      category: "feature-request",
      text: "Request: dark mode for web app.",
    },
    {
      id: "tkt-106",
      category: "billing",
      text: "Trial user confused by enterprise plan callouts on pricing page.",
    },
  ],
  metrics: {
    signups: 4800,
    onboardingCompleted: 1728,
    activationRate: 0.36,
    weekOneRetention: 0.41,
    onboardingSteps: [
      { step: "create-workspace", started: 4800, completed: 4100 },
      { step: "invite-team", started: 4100, completed: 2100 },
      { step: "connect-integration", started: 2100, completed: 1900 },
      { step: "create-first-task", started: 1900, completed: 1728 },
    ],
    featureAdoption: [
      { feature: "tasks", adopters: 1728 },
      { feature: "integrations", adopters: 1900 },
      { feature: "dark-mode", adopters: 120 },
    ],
  },
  context: {
    targetSegment: "Self-serve SMB teams (5–25 seats)",
    strategicObjective: "Increase new-user activation and week-one retention",
    constraints: ["No net-new enterprise SSO scope this quarter", "Ship improvements within one sprint cycle"],
    outOfScope: ["Full visual redesign", "Net-new mobile apps"],
  },
};

const FIXTURES: Record<string, ProductFixture> = {
  "flowtask-pro": FLOWTASK_PRO,
};

export function resolveProductFixture(productId: string): ProductFixture {
  const fixture = FIXTURES[productId];
  if (fixture === undefined) {
    throw new Error(`Product '${productId}' was not found in product demo fixtures.`);
  }
  return fixture;
}

export function buildEvidenceBundle(productId: string): ProductEvidenceBundle {
  const fixture = resolveProductFixture(productId);
  return {
    productId,
    feedback: fixture.feedback.map((item) => ({ ...item })),
    tickets: fixture.tickets.map((item) => ({ ...item })),
    metrics: {
      ...fixture.metrics,
      onboardingSteps: fixture.metrics.onboardingSteps.map((step) => ({ ...step })),
      featureAdoption: fixture.metrics.featureAdoption.map((item) => ({ ...item })),
    },
    context: {
      ...fixture.context,
      constraints: [...fixture.context.constraints],
      outOfScope: [...fixture.context.outOfScope],
    },
  };
}

export function getFixtureCustomerFeedback(productId: string): ProductEvidenceBundle["feedback"] {
  return buildEvidenceBundle(productId).feedback;
}

export function getFixtureSupportTickets(productId: string): ProductEvidenceBundle["tickets"] {
  return buildEvidenceBundle(productId).tickets;
}

export function getFixtureProductMetrics(productId: string): ProductMetrics {
  return buildEvidenceBundle(productId).metrics;
}

export function getFixtureProductContext(productId: string): ProductContext {
  return buildEvidenceBundle(productId).context;
}

export const DEMO_EVIDENCE = buildEvidenceBundle("flowtask-pro");
