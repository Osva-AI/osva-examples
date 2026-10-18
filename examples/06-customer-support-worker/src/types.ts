export type CustomerTier = "standard" | "premium";

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly tier?: CustomerTier;
  readonly primaryOrderId: string;
}

export type OrderStatus = "processing" | "shipped" | "delivered" | "cancelled";

export interface Order {
  readonly id: string;
  readonly customerId: string;
  status: OrderStatus;
  readonly totalAmount: number;
  readonly currency: string;
  readonly placedAt: string;
  readonly deliveredAt?: string;
  readonly shipmentId?: string;
}

export type ShipmentStatus = "label-created" | "in-transit" | "delayed" | "delivered";

export interface Shipment {
  readonly id: string;
  status: ShipmentStatus;
  readonly expectedDeliveryDate?: string;
}

export type SupportIntent = "order-status" | "shipment-delay" | "refund-request" | "cancel-order" | "unknown";

export type PolicyAction = "reply-only" | "refund" | "cancel" | "escalate";

export interface PolicyDecision {
  readonly eligible: boolean;
  readonly action: PolicyAction;
  readonly requiresApproval: boolean;
  readonly reason: string;
  readonly amount?: number;
}

export type WorkflowRoute = "reply-only" | "auto-action" | "needs-approval" | "escalate";

export interface SupportWorkerInput {
  readonly customerId: string;
  readonly message: string;
}

export interface SupportWorkerRequest extends SupportWorkerInput {
  readonly ticketId: string;
}

export interface ActionExecutionResult {
  readonly actionId: string;
  readonly status: "completed" | "already-completed" | "rejected";
  readonly message: string;
}

export interface EscalationRecord {
  readonly escalationId: string;
  readonly reason: string;
  readonly summary: string;
}

export interface ApprovalDecisionRecord {
  readonly decision: "APPROVED" | "REJECTED";
  readonly comment?: string;
}
