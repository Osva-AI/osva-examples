/** Synthetic corpus used to validate offline answer formatting (not OSVA retrieval). */
export const FIXTURE_PASSAGES = [
  {
    id: "handbook-refund",
    text: "Annual subscriptions may be refunded within 30 days of purchase when usage remains below pilot thresholds.",
    heading: "Billing handbook",
  },
  {
    id: "policy-support",
    text: "Support refunds require ticket classification and human approval before credits are issued.",
    heading: "Support policy",
  },
] as const;
