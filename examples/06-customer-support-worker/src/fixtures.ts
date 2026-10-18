import type { Customer, Order, Shipment } from "./types.js";

/** Fixed "now" for deterministic demo policy windows (not wall-clock dependent in CI). */
export const DEMO_POLICY_NOW_MS = Date.parse("2026-03-15T12:00:00.000Z");

export const REFUND_AUTO_APPROVE_THRESHOLD_USD = 100;
export const REFUND_ELIGIBILITY_DAYS_AFTER_DELIVERY = 14;

const seedCustomers: readonly Customer[] = [
  {
    id: "cust-demo-001",
    name: "Alex Demo",
    tier: "standard",
    primaryOrderId: "ord-delay-40",
  },
  {
    id: "cust-enterprise-001",
    name: "Jordan Enterprise",
    tier: "premium",
    primaryOrderId: "ord-delay-900",
  },
  {
    id: "cust-archive-001",
    name: "Sam Archive",
    tier: "standard",
    primaryOrderId: "ord-delivered-old",
  },
  {
    id: "cust-cancelled-001",
    name: "Casey Cancelled",
    tier: "standard",
    primaryOrderId: "ord-already-cancelled",
  },
  {
    id: "cust-status-001",
    name: "Riley Status",
    tier: "standard",
    primaryOrderId: "ord-in-transit-ok",
  },
];

const seedOrders: readonly Order[] = [
  {
    id: "ord-delay-40",
    customerId: "cust-demo-001",
    status: "shipped",
    totalAmount: 40,
    currency: "USD",
    placedAt: "2026-03-01T10:00:00.000Z",
    shipmentId: "ship-delay-40",
  },
  {
    id: "ord-delay-900",
    customerId: "cust-enterprise-001",
    status: "shipped",
    totalAmount: 900,
    currency: "USD",
    placedAt: "2026-02-20T10:00:00.000Z",
    shipmentId: "ship-delay-900",
  },
  {
    id: "ord-delivered-old",
    customerId: "cust-archive-001",
    status: "delivered",
    totalAmount: 120,
    currency: "USD",
    placedAt: "2025-11-01T10:00:00.000Z",
    deliveredAt: "2025-12-01T16:00:00.000Z",
    shipmentId: "ship-delivered-old",
  },
  {
    id: "ord-already-cancelled",
    customerId: "cust-cancelled-001",
    status: "cancelled",
    totalAmount: 55,
    currency: "USD",
    placedAt: "2026-03-05T10:00:00.000Z",
  },
  {
    id: "ord-in-transit-ok",
    customerId: "cust-status-001",
    status: "shipped",
    totalAmount: 75,
    currency: "USD",
    placedAt: "2026-03-10T10:00:00.000Z",
    shipmentId: "ship-in-transit-ok",
  },
];

const seedShipments: readonly Shipment[] = [
  {
    id: "ship-delay-40",
    status: "delayed",
    expectedDeliveryDate: "2026-03-10T18:00:00.000Z",
  },
  {
    id: "ship-delay-900",
    status: "delayed",
    expectedDeliveryDate: "2026-03-08T18:00:00.000Z",
  },
  {
    id: "ship-delivered-old",
    status: "delivered",
    expectedDeliveryDate: "2025-11-20T18:00:00.000Z",
  },
  {
    id: "ship-in-transit-ok",
    status: "in-transit",
    expectedDeliveryDate: "2026-03-18T18:00:00.000Z",
  },
];

let liveOrders: Order[] = seedOrders.map((order) => ({ ...order }));
const completedActionIds = new Set<string>();

export function resetSupportFixtureState(): void {
  liveOrders = seedOrders.map((order) => ({ ...order }));
  completedActionIds.clear();
}

export function getFixtureCustomer(customerId: string): Customer | undefined {
  return seedCustomers.find((customer) => customer.id === customerId);
}

export function getFixtureOrder(orderId: string): Order | undefined {
  const order = liveOrders.find((item) => item.id === orderId);
  return order === undefined ? undefined : { ...order };
}

export function getFixtureShipment(shipmentId: string): Shipment | undefined {
  const shipment = seedShipments.find((item) => item.id === shipmentId);
  return shipment === undefined ? undefined : { ...shipment };
}

export function getPrimaryOrderForCustomer(customerId: string): Order | undefined {
  const customer = getFixtureCustomer(customerId);
  if (customer === undefined) {
    return undefined;
  }
  return getFixtureOrder(customer.primaryOrderId);
}

export function mutateOrder(orderId: string, update: Partial<Pick<Order, "status">>): Order | undefined {
  const index = liveOrders.findIndex((order) => order.id === orderId);
  if (index < 0) {
    return undefined;
  }
  const current = liveOrders[index];
  if (current === undefined) {
    return undefined;
  }
  const next: Order = { ...current, ...update };
  liveOrders[index] = next;
  return { ...next };
}

export function markActionCompleted(actionId: string): boolean {
  if (completedActionIds.has(actionId)) {
    return false;
  }
  completedActionIds.add(actionId);
  return true;
}

export function isActionCompleted(actionId: string): boolean {
  return completedActionIds.has(actionId);
}

export function daysBetween(fromIso: string, toMs: number): number {
  const fromMs = Date.parse(fromIso);
  if (Number.isNaN(fromMs)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000));
}

export function isShipmentUndeliveredDelayed(
  order: Order,
  shipment: Shipment | undefined,
  nowMs: number = DEMO_POLICY_NOW_MS,
): boolean {
  if (order.status === "delivered" || order.status === "cancelled") {
    return false;
  }
  if (shipment === undefined) {
    return false;
  }
  if (shipment.status === "delayed") {
    return true;
  }
  if (shipment.expectedDeliveryDate === undefined) {
    return false;
  }
  return Date.parse(shipment.expectedDeliveryDate) < nowMs && shipment.status !== "delivered";
}
