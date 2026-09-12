const path = require('node:path')
const service = require(path.resolve(process.argv[2]))
const sample = {
  id: 'WH-3F562076HD293871E-75F399086E414290U',
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: {
    id: '3Y662965014333303', status: 'COMPLETED',
    amount: { value: '14.99', currency_code: 'USD' },
    supplementary_data: { related_ids: { order_id: '9P99943869582473S' } }
  }
}
try {
  const result = service.mapPayPalWebhookAction(sample)
  console.log(JSON.stringify({ official_shape_accepted: true, action: result.action }))
} catch (error) {
  console.log(JSON.stringify({ official_shape_accepted: false, error_name: error?.name || 'Error', message: error?.message || String(error) }))
}

