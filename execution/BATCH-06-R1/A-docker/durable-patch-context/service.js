"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const utils_1 = require("@medusajs/framework/utils");
const paypal_event_inbox_1 = __importDefault(require("./models/paypal-event-inbox"));
const paypal_payment_operation_1 = __importDefault(require("./models/paypal-payment-operation"));
const safeText = (value) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const digest = (value) => (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
const tail = (value) => value ? value.slice(-8) : undefined;
class PayPalReconciliationModuleService extends (0, utils_1.MedusaService)({ PayPalEventInbox: paypal_event_inbox_1.default, PayPalPaymentOperation: paypal_payment_operation_1.default }) {
    async recordVerifiedWebhookEvent(input) {
        const eventId = safeText(input.event.id);
        const eventType = safeText(input.event.event_type) || "UNKNOWN";
        if (!eventId)
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "PayPal webhook persistence requires a provider event ID.");
        const resource = input.event.resource && typeof input.event.resource === "object" && !Array.isArray(input.event.resource)
            ? input.event.resource
            : {};
        const resourceId = safeText(resource.id);
        const correlationId = safeText(input.medusa_session_id);
        const rawAmount = resource.amount && typeof resource.amount === "object" && !Array.isArray(resource.amount)
            ? resource.amount
            : {};
        const amount = safeText(rawAmount.value);
        const currency = safeText(rawAmount.currency_code)?.toUpperCase();
        const service = this;
        const providerEventKey = digest(eventId);
        let record;
        try {
            const created = await service.createPayPalEventInboxes([{
                    provider_event_id: providerEventKey,
                    provider: "paypal",
                    status: "received",
                    provider_resource_id: safeText(input.provider_resource_id) || (resourceId ? digest(resourceId) : null),
                    medusa_session_id: correlationId || null,
                    medusa_order_id: safeText(input.medusa_order_id) || null,
                    amount: safeText(input.amount) || amount || null,
                    currency_code: safeText(input.currency_code)?.toUpperCase() || currency || null,
                    event_type: eventType,
                    received_at: new Date(),
                    applied_at: null,
                    failure_reason: null,
                    safe_metadata: {
                        provider_event_id_tail: tail(eventId),
                        provider_resource_id_tail: tail(resourceId),
                        event_type: eventType,
                        action: input.action,
                    },
                }]);
            record = created[0];
            if (!record)
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "PayPal webhook inbox insert returned no record.");
        }
        catch (error) {
            const existing = await service.listPayPalEventInboxes({ provider_event_id: providerEventKey });
            if (!existing.length)
                throw error;
            return { replayed: true, claimed: false, record: existing[0] };
        }
        const verified = await service.updatePayPalEventInboxes([{ id: record.id, status: "verified" }]);
        return { replayed: false, claimed: true, record: (verified[0] || record) };
    }
    async markDispatchRequested(id) {
        const service = this;
        const records = await service.updatePayPalEventInboxes([{ id, status: "dispatch_requested" }]);
        if (!records[0])
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "PayPal webhook dispatch claim read-back failed.");
        return records[0];
    }
    async updateVerifiedWebhookEvent(id, values) {
        const service = this;
        const records = await service.updatePayPalEventInboxes([{ id, ...values }]);
        if (!records[0])
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "PayPal webhook mapping read-back failed.");
        return records[0];
    }
    async markWebhookFailed(id, reason) {
        const service = this;
        const records = await service.updatePayPalEventInboxes([{ id, status: "failed", failure_reason: reason.slice(0, 160) }]);
        if (!records[0])
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "PayPal webhook failure state read-back failed.");
        return records[0];
    }
    async markAppliedAfterMedusaReadback(id, medusaState) {
        const service = this;
        const current = (await service.listPayPalEventInboxes({ id }))[0];
        if (!current || current.status !== "dispatch_requested")
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, "PayPal event is not awaiting Medusa read-back.");
        const updated = await service.updatePayPalEventInboxes([{ id, status: "applied", applied_at: new Date(), safe_metadata: { medusa_state: medusaState } }]);
        return updated[0];
    }
    async listReconciliationCandidates() {
        const service = this;
        return service.listPayPalEventInboxes({ status: ["received", "verified", "dispatch_requested", "held", "failed"] });
    }
    async reconcileRefundOperation(input) {
        const service = this;
        const current = (await service.listPayPalPaymentOperations({ operation_key: input.operation_key }))[0];
        if (!current)
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Refund reconciliation operation is not registered.");
        const readBack = await input.retrieveRefund({ refund_id: input.refund_id });
        if (readBack.refund_id !== input.refund_id)
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Refund read-back belongs to a different operation.");
        const providerStatus = readBack.status.toUpperCase();
        const status = providerStatus === "COMPLETED" ? "completed" : ["FAILED", "DENIED", "DECLINED"].includes(providerStatus) ? "failed" : "pending";
        await service.updatePayPalPaymentOperations([{ id: current.id, status }]);
        return { status };
    }
}
exports.default = PayPalReconciliationModuleService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9tb2R1bGVzL3BheXBhbC1yZWNvbmNpbGlhdGlvbi9zZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEsNkNBQXdDO0FBQ3hDLHFEQUFzRTtBQUN0RSxxRkFBMEQ7QUFDMUQsaUdBQXNFO0FBa0J0RSxNQUFNLFFBQVEsR0FBRyxDQUFDLEtBQWMsRUFBRSxFQUFFLENBQUMsT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUE7QUFDekcsTUFBTSxNQUFNLEdBQUcsQ0FBQyxLQUFhLEVBQUUsRUFBRSxDQUFDLElBQUEsd0JBQVUsRUFBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFBO0FBQ2xGLE1BQU0sSUFBSSxHQUFHLENBQUMsS0FBeUIsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQTtBQUUvRSxNQUFNLGlDQUFrQyxTQUFRLElBQUEscUJBQWEsRUFBQyxFQUFFLGdCQUFnQixFQUFoQiw0QkFBZ0IsRUFBRSxzQkFBc0IsRUFBdEIsa0NBQXNCLEVBQUUsQ0FBQztJQUN6RyxLQUFLLENBQUMsMEJBQTBCLENBQUMsS0FBd0I7UUFDdkQsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUE7UUFDeEMsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksU0FBUyxDQUFBO1FBQy9ELElBQUksQ0FBQyxP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