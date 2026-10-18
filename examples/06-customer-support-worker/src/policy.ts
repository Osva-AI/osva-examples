import {
  DEMO_POLICY_NOW_MS,
  REFUND_AUTO_APPROVE_THRESHOLD_USD,
  REFUND_ELIGIBILITY_DAYS_AFTER_DELIVERY,
  daysBetween,
  isShipmentUndeliveredDelayed,
} from "./fixtures.js";
import type { Customer, Order, PolicyDecision, Shipment, SupportIntent, WorkflowRoute } from "./types.js";

/**
 * Demo-only policy engine. These rules are fixtures for the example — not production policy.
 */
export function evaluateSupportPolicy(input: {
  readonly intent: SupportIntent;
  readonly customer: Customer | undefined;
  readonly order: Order | undefined;
  readonly shipment: Shipment | undefined;
  readonly message: string;
  readonly nowMs?: number;
}): PolicyDecision {
  const nowMs = input.nowMs ?? DEMO_POLICY_NOW_MS;

  if (input.customer === undefined || input.order === undefined) {
    return {
      eligible: false,
      action: "escalate",
      requiresApproval: false,
      reason: "Customer or order context could not be loaded from demo fixtures.",
    };
  }

  if (input.intent === "unknown") {
    return {
      eligible: false,
      action: "escalate",
      requiresApproval: false,
      reason: "Intent could not be mapped to a supported demo workflow.",
    };
  }

  if (input.order.status === "cancelled") {
    return {
      eligible: false,
      action: "reply-only",
      requiresApproval: false,
      reason: "The order is already cancelled; duplicate cancellation is not allowed.",
    };
  }

  if (input.intent === "order-status" || input.intent === "shipment-delay") {
    return {
      eligible: true,
      action: "reply-only",
      requiresApproval: false,
      reason: "Provide current order and shipment status without changing order state.",
    };
  }

  if (input.intent === "cancel-order") {
    if (isShipmentUndeliveredDelayed(input.order, input.shipment, nowMs)) {
      return {
        eligible: true,
        action: "cancel",
        requiresApproval: false,
        reason: "Undelivered delayed shipment qualifies for automatic demo cancellation.",
      };
    }
    if (input.order.status === "delivered") {
      return {
        eligible: false,
        action: "reply-only",
        requiresApproval: false,
        reason: "Delivered orders cannot be cancelled under the demo policy.",
      };
    }
    return {
      eligible: false,
      action: "escalate",
      requiresApproval: false,
      reason: "Cancellation request requires manual review under the demo policy.",
    };
  }

  if (input.intent === "refund-request") {
    if (input.order.status === "delivered" && input.order.deliveredAt !== undefined) {
      const daysSinceDelivery = daysBetween(input.order.deliveredAt, nowMs);
      if (daysSinceDelivery > REFUND_ELIGIBILITY_DAYS_AFTER_DELIVERY) {
        return {
          eligible: false,
          action: "reply-only",
          requiresApproval: false,
          reason: `Delivered order is outside the ${REFUND_ELIGIBILITY_DAYS_AFTER_DELIVERY}-day demo refund window.`,
        };
      }
      const requiresApproval = input.order.totalAmount > REFUND_AUTO_APPROVE_THRESHOLD_USD;
      return {
        eligible: true,
        action: "refund",
        requiresApproval,
        reason: requiresApproval
          ? "Recent delivery refund exceeds the demo auto-approval threshold."
          : "Recent delivery refund is within the demo auto-approval threshold.",
        amount: input.order.totalAmount,
      };
    }

    if (isShipmentUndeliveredDelayed(input.order, input.shipment, nowMs)) {
      const requiresApproval = input.order.totalAmount > REFUND_AUTO_APPROVE_THRESHOLD_USD;
      return {
        eligible: true,
        action: "refund",
        requiresApproval,
        reason: requiresApproval
          ? "Delayed undelivered refund exceeds the demo auto-approval threshold."
          : "Delayed undelivered shipment qualifies for automatic demo refund.",
        amount: input.order.totalAmount,
      };
    }

    return {
      eligible: false,
      action: "reply-only",
      requiresApproval: false,
      reason: "Refund is not eligible under the demo policy for the current order state.",
    };
  }

  return {
    eligible: false,
    action: "escalate",
    requiresApproval: false,
    reason: "Unhandled intent/policy combination in demo fixtures.",
  };
}

export function planWorkflowRoute(policy: PolicyDecision): WorkflowRoute {
  if (policy.action === "escalate") {
    return "escalate";
  }
  if (policy.action === "reply-only") {
    return "reply-only";
  }
  if (policy.requiresApproval) {
    return "needs-approval";
  }
  if (policy.action === "refund" || policy.action === "cancel") {
    return "auto-action";
  }
  return "escalate";
}
