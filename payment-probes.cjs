const assert = require('node:assert/strict')
const backend = 'C:/Users/34707/Documents/ChatGPT/跨境电商/CrossBorder-Independent-Store/03_template/medusa-crossborder-base/apps/backend'
require(require.resolve('ts-node', {paths: [backend]})).register({transpileOnly:true, skipProject:true, compilerOptions:{module:'CommonJS',moduleResolution:'Node',target:'ES2020'}})
const {PayPalPaymentProviderService, mapPayPalWebhookAction} = require(backend + '/src/modules/paypal/service.ts')
const base = {session_id:'payses_review',paypal_order_id:'ORDER-A',paypal_authorization_id:'AUTH-A',paypal_capture_id:'CAPTURE-A',amount:'14.99',currency_code:'USD'}
const refundCalls = []
const transport = {
  retrieveOrder: async () => ({order_id:'ORDER-B',status:'COMPLETED',capture_id:'CAPTURE-B',amount:'14.99',currency_code:'USD'}),
  authorizeOrder: async () => ({order_id:'ORDER-A',status:'COMPLETED',authorization_id:'AUTH-A'}),
  refundCapture: async input => { refundCalls.push(input); return {refund_id:'REFUND-A',status:'COMPLETED',amount:input.amount,currency_code:input.currency_code} },
}
const service = new PayPalPaymentProviderService({}, {enabled:true,environment:'sandbox',payment_intent:'AUTHORIZE',transport})
;(async () => {
  const status = await service.getPaymentStatus({data:base})
  assert.equal(status.status, 'captured')
  assert.equal(status.data.paypal_capture_id, 'CAPTURE-B')
  console.log('CONFIRMED: getPaymentStatus accepts different PayPal order ID; result contains ORDER-A with CAPTURE-B')
  await assert.rejects(service.retrievePayment({data:base}), /different order/)
  const authorized = await service.authorizePayment({data:base})
  assert.equal(authorized.status, 'authorized')
  console.log('CONFIRMED: authorizePayment accepts no amount/currency evidence')
  const first = await service.refundPayment({data:base,amount:'5.00',context:{idempotency_key:'refund-op-a'}})
  const replay = await service.refundPayment({data:first.data,amount:'5.00',context:{idempotency_key:'refund-op-a'}})
  assert.equal(refundCalls[0].idempotency_key, refundCalls[1].idempotency_key)
  assert.equal(replay.data.refunded_amount, '10.00')
  console.log('CONFIRMED: same refund operation/provider refund ID with persisted input increments local refunded_amount from 5.00 to 10.00')
  const event = mapPayPalWebhookAction({event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{custom_id:'payses_review',amount:{value:'0.01',currency_code:'EUR'}}})
  assert.equal(event.action,'captured')
  console.log('CONFIRMED: webhook mapper accepts actionable event without event ID/resource ID/order ID and has no local amount/currency binding (unit boundary only)')
})().catch(e => {console.error(e); process.exitCode=1})
