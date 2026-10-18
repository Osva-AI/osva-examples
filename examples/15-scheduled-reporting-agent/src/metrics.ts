export interface OperationalMetrics {
  readonly period: string;
  readonly runsSucceeded: number;
  readonly runsFailed: number;
  readonly medianLatencyMs: number;
  readonly approvalBacklog: number;
}

export function collectFixtureMetrics(period: string): OperationalMetrics {
  return {
    period,
    runsSucceeded: 128,
    runsFailed: 4,
    medianLatencyMs: 920,
    approvalBacklog: 2,
  };
}
