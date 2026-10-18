import type { DependencyHealth, DeploymentRecord, LogEvent, ServiceHealth } from "./types.js";

const completedActions = new Set<string>();

interface ServiceState {
  health: ServiceHealth;
  logs: LogEvent[];
  deployments: DeploymentRecord[];
  dependencies: DependencyHealth[];
  restartOnlyApplied: boolean;
}

const INITIAL_CHECKOUT: ServiceState = {
  restartOnlyApplied: false,
  health: {
    name: "checkout-api",
    status: "degraded",
    errorRate: 0.23,
    latencyMs: 1850,
  },
  logs: [
    {
      id: "log-001",
      timestamp: "2026-10-18T14:00:12Z",
      level: "info",
      message: "Deployment dep-442 completed for checkout-api v2.3.1",
      service: "checkout-api",
    },
    {
      id: "log-002",
      timestamp: "2026-10-18T14:02:04Z",
      level: "error",
      message: "Database connection pool exhausted (max=20)",
      service: "checkout-api",
    },
    {
      id: "log-003",
      timestamp: "2026-10-18T14:02:18Z",
      level: "error",
      message: "Checkout request timeout after 1800ms",
      service: "checkout-api",
    },
    {
      id: "log-004",
      timestamp: "2026-10-18T14:03:01Z",
      level: "warn",
      message: "Downstream payments-api returning elevated 503 responses",
      service: "checkout-api",
    },
  ],
  deployments: [
    {
      deploymentId: "dep-442",
      service: "checkout-api",
      version: "2.3.1",
      previousVersion: "2.3.0",
      deployedAt: "2026-10-18T14:00:10Z",
      status: "active",
    },
    {
      deploymentId: "dep-438",
      service: "checkout-api",
      version: "2.3.0",
      previousVersion: "2.2.9",
      deployedAt: "2026-10-10T09:15:00Z",
      status: "rolled-back",
    },
  ],
  dependencies: [
    {
      name: "postgres-primary",
      status: "degraded",
      detail: "Connection pool saturation correlated with checkout-api v2.3.1",
    },
    {
      name: "payments-api",
      status: "degraded",
      detail: "Elevated 503 rate — likely secondary to checkout timeouts",
    },
    {
      name: "redis-cache",
      status: "healthy",
      detail: "Operating normally",
    },
    {
      name: "kafka-broker",
      status: "healthy",
      detail: "Operating normally",
    },
  ],
};

const serviceStates = new Map<string, ServiceState>([["checkout-api", cloneState(INITIAL_CHECKOUT)]]);

export function resetIncidentFixtures(): void {
  completedActions.clear();
  serviceStates.set("checkout-api", cloneState(INITIAL_CHECKOUT));
}

function cloneState(state: ServiceState): ServiceState {
  return {
    health: { ...state.health },
    logs: state.logs.map((item) => ({ ...item })),
    deployments: state.deployments.map((item) => ({ ...item })),
    dependencies: state.dependencies.map((item) => ({ ...item })),
    restartOnlyApplied: false,
  };
}

function getState(service: string): ServiceState {
  const state = serviceStates.get(service);
  if (state === undefined) {
    throw new Error(`Service '${service}' was not found in incident demo fixtures.`);
  }
  return state;
}

export function getFixtureServiceHealth(service: string): ServiceHealth {
  return { ...getState(service).health };
}

export function getFixtureRecentLogs(service: string): LogEvent[] {
  return getState(service).logs.map((item) => ({ ...item }));
}

export function getFixtureRecentDeployments(service: string): DeploymentRecord[] {
  return getState(service).deployments.map((item) => ({ ...item }));
}

export function getFixtureDependencyHealth(service: string): DependencyHealth[] {
  return getState(service).dependencies.map((item) => ({ ...item }));
}

export function isActionCompleted(actionId: string): boolean {
  return completedActions.has(actionId);
}

export function markActionCompleted(actionId: string): void {
  completedActions.add(actionId);
}

export function rollbackDeployment(input: {
  readonly service: string;
  readonly deploymentId: string;
  readonly actionId: string;
}): { readonly status: "completed" | "already-completed" | "rejected"; readonly details: string } {
  if (isActionCompleted(input.actionId)) {
    return { status: "already-completed", details: "Rollback already applied for this actionId." };
  }
  const state = getState(input.service);
  const active = state.deployments.find((item) => item.deploymentId === input.deploymentId && item.status === "active");
  if (active === undefined) {
    return { status: "rejected", details: `Deployment ${input.deploymentId} is not active.` };
  }
  markActionCompleted(input.actionId);
  state.deployments = state.deployments.map((deployment) =>
    deployment.deploymentId === input.deploymentId ? { ...deployment, status: "rolled-back" } : deployment,
  );
  state.health = {
    ...state.health,
    status: "healthy",
    errorRate: 0.02,
    latencyMs: 320,
  };
  state.dependencies = state.dependencies.map((dep) =>
    dep.name === "postgres-primary"
      ? { ...dep, status: "healthy", detail: "Pool utilization normalized after rollback" }
      : dep.name === "payments-api"
        ? { ...dep, status: "healthy", detail: "503 rate normalized after checkout recovery" }
        : dep,
  );
  state.restartOnlyApplied = false;
  return {
    status: "completed",
    details: `Rolled back ${input.service} from ${active.version} to ${active.previousVersion}.`,
  };
}

export function restartService(input: { readonly service: string; readonly actionId: string }): {
  readonly status: "completed" | "already-completed" | "rejected";
  readonly details: string;
} {
  if (isActionCompleted(input.actionId)) {
    return { status: "already-completed", details: "Restart already applied for this actionId." };
  }
  const state = getState(input.service);
  markActionCompleted(input.actionId);
  state.restartOnlyApplied = true;
  state.health = {
    ...state.health,
    status: "degraded",
    errorRate: 0.18,
    latencyMs: 1600,
  };
  return {
    status: "completed",
    details: "Service processes restarted — configuration unchanged (demo: insufficient for recovery).",
  };
}

export function serviceRecoveredAfterRemediation(service: string): boolean {
  const state = getState(service);
  if (state.restartOnlyApplied && state.health.status !== "healthy") {
    return false;
  }
  return state.health.status === "healthy" && state.health.errorRate < 0.05;
}
