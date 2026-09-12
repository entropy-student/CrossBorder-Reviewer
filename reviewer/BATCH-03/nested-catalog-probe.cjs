const path = require('node:path')
const catalog = require(path.resolve(process.argv[2]))
const sample = {
  cart: {
    items: [{
      metadata: { line_private: 'secret' },
      product: { metadata: { pawfectly_store_integration_approved_by_user: 'YES', supplier_url: 'https://private.example', cost_price: '1.60' } },
      variant: { metadata: { supplier_sku: 'private-sku' } }
    }]
  }
}
const projected = catalog.projectPublicProductResponse(sample)
console.log(JSON.stringify({ nested_cart_product_private_metadata_survives: projected.cart.items[0].product.metadata.supplier_url === 'https://private.example', nested_variant_private_metadata_survives: projected.cart.items[0].variant.metadata.supplier_sku === 'private-sku', output: projected }))
