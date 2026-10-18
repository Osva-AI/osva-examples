import type {
  ActionExecutionResult,
  ApprovalDecisionRecord,
  Customer,
  EscalationRecord,
  Order,
  PolicyDecision,
  Shipment,
  SupportIntent,
  SupportWorkerRequest,
} from "./types.js";

export function createEscalation(input: {
  readonly ticketId: string;
  readonly reason: string;
  readonly customer?: Customer;
  readonly order?: Order;
  readonly message: string;
}): EscalationRecord {
  const escalationId = `esc-${input.ticketId.slice(0, 8)}`;
  const summary = [
    `Ticket ${input.ticketId}`,
    input.customer === undefined ? "Unknown customer" : `${input.customer.name} (${input.customer.id})`,
    input.order === undefined ? "Unknown order" : `Order ${input.order.id} (${input.order.status})`,
    `Message: ${input.message}`,
    `Reason: ${input.reason}`,
  ].join(" | ");
  return { escalationId, reason: input.reason, summary };
}

export function generateCustomerResponse(input: {
  readonly request: SupportWorkerRequest;
  readonly intent: SupportIntent;
  readonly customer?: Customer;
  readonly order?: Order;
  readonly shipment?: Shipment;
  readonly policyDecision: PolicyDecision;
  readonly approvalDecision?: ApprovalDecisionRecord;
  readonly actionResult?: ActionExecutionResult;
  readonly escalation?: EscalationRecord;
}): string {
  const greeting = input.customer === undefined ? "Hello," : `Hello ${input.customer.name},`;

  if (input.escalation !== undefined) {
    return `${greeting} your request (${input.request.ticketId}) has been escalated for specialist review. Reference: ${input.escalation.escalationId}. ${input.escalation.reason}`;
  }

  if (input.intent === "order-status" || input.intent === "shipment-delay") {
    const orderLine =
      input.order === undefined
        ? "We could not locate your order in the demo system."
        : `Order ${input.order.id} is ${input.order.status}.`;
    const shipmentLine =
      input.shipment === undefined
        ? "Shipment details are unavailable."
        : `Shipment ${input.shipment.id} is ${input.shipment.status}` +
          (input.shipment.expectedDeliveryDate === undefined
            ? "."
            : ` with expected delivery ${input.shipment.expectedDeliveryDate}.`);
    return `${greeting} ${orderLine} ${shipmentLine}`;
  }

  if (input.policyDecision.action === "reply-only" && input.actionResult === undefined) {
    return `${greeting} ${input.policyDecision.reason}`;
  }

  if (input.approvalDecision?.decision === "REJECTED") {
    return `${greeting} your request requires additional review. No ${input.policyDecision.action} was applied. ${input.policyDecision.reason}`;
  }

  if (input.actionResult === undefined) {
    return `${greeting} we are processing your request. ${input.policyDecision.reason}`;
  }

  if (input.actionResult.status === "rejected") {
    return `${greeting} we could not complete the requested action. ${input.actionResult.message}`;
  }

  if (
    input.policyDecision.action === "refund" &&
    (input.actionResult.status === "completed" || input.actionResult.status === "already-completed")
  ) {
    const amount = input.policyDecision.amount ?? input.order?.totalAmount;
    const currency = input.order?.currency ?? "USD";
    if (amount === undefined) {
      return `${greeting} your refund has been processed in the demo system. ${input.actionResult.message}`;
    }
    return `${greeting} your refund of ${currency} ${amount.toFixed(2)} has been approved and processed in the demo system. ${input.actionResult.message}`;
  }

  if (input.policyDecision.action === "cancel") {
    return `${greeting} your order cancellation has been completed in the demo system. ${input.actionResult.message}`;
  }

  return `${greeting} ${input.policyDecision.reason}`;
}
