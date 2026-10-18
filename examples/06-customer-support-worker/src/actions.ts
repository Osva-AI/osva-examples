import { getFixtureOrder, isActionCompleted, markActionCompleted, mutateOrder } from "./fixtures.js";
import type { ActionExecutionResult, PolicyDecision } from "./types.js";

export function validateActionId(actionId: string): string {
  const trimmed = actionId.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    throw new Error("actionId must be between 8 and 128 characters.");
  }
  return trimmed;
}

export function issueRefund(input: {
  readonly orderId: string;
  readonly amount: number;
  readonly actionId: string;
}): ActionExecutionResult {
  const actionId = validateActionId(input.actionId);
  if (isActionCompleted(actionId)) {
    return {
      actionId,
      status: "already-completed",
      message: "Refund action was already completed for this idempotency key.",
    };
  }
  const order = getFixtureOrder(input.orderId);
  if (order === undefined) {
    return { actionId, status: "rejected", message: "Order not found in demo fixtures." };
  }
  if (order.status === "cancelled") {
    return { actionId, status: "rejected", message: "Cannot refund a cancelled demo order." };
  }
  if (input.amount <= 0 || input.amount !== order.totalAmount) {
    return {
      actionId,
      status: "rejected",
      message: "Refund amount must match the demo order total.",
    };
  }
  markActionCompleted(actionId);
  mutateOrder(order.id, { status: "cancelled" });
  return {
    actionId,
    status: "completed",
    message: `Refund of ${order.currency} ${order.totalAmount.toFixed(2)} recorded in demo ledger.`,
  };
}

export function cancelOrder(input: { readonly orderId: string; readonly actionId: string }): ActionExecutionResult {
  const actionId = validateActionId(input.actionId);
  if (isActionCompleted(actionId)) {
    return {
      actionId,
      status: "already-completed",
      message: "Cancellation action was already completed for this idempotency key.",
    };
  }
  const order = getFixtureOrder(input.orderId);
  if (order === undefined) {
    return { actionId, status: "rejected", message: "Order not found in demo fixtures." };
  }
  if (order.status === "cancelled") {
    markActionCompleted(actionId);
    return {
      actionId,
      status: "already-completed",
      message: "Order was already cancelled in demo fixtures.",
    };
  }
  if (order.status === "delivered") {
    return { actionId, status: "rejected", message: "Delivered demo orders cannot be cancelled." };
  }
  markActionCompleted(actionId);
  mutateOrder(order.id, { status: "cancelled" });
  return {
    actionId,
    status: "completed",
    message: `Order ${order.id} cancelled in demo ledger.`,
  };
}

export function buildActionIdempotencyKey(ticketId: string, policy: PolicyDecision): string {
  return `${ticketId}-${policy.action}-${policy.amount ?? 0}`;
}
