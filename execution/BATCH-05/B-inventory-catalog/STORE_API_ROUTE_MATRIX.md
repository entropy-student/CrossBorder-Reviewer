# Store API Route Matrix

| Route family | Methods covered by middleware/projection | Result |
|---|---|---|
| `/store/products` | GET | public projection + approved catalog |
| `/store/products/:id` | GET | public projection + metadata sanitization |
| `/store/carts` | POST | public projection |
| `/store/carts/:id` | GET/POST/DELETE | public projection |
| `/store/carts/:id/line-items` | GET/POST | public projection |
| `/store/carts/:id/line-items/:line_id` | GET/POST/DELETE | public projection |
| `/store/carts/:id/complete` | POST | projection + payment/shipping safety gate |
| `/store/orders` | GET | public projection |
| `/store/orders/:id` | GET | public projection |
| `/store/payment-providers` | GET | customer filter |
| `/store/payment-collections/:id/payment-sessions` | POST | customer/provider safety gate |
| `/store/shipping-options` | GET | customer filter |
| `/store/carts/:id/shipping-methods` | POST | customer/shipping safety gate |

HTTP integration against a real PayPal payment session remains blocked by the
sandbox credential preflight; local route and projection tests pass.
