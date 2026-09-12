import { projectPublicProductResponse } from "../public-catalog"

describe("public product response boundary", () => {
  it("keeps only approved customer metadata on products and variants", () => {
    const response = projectPublicProductResponse({
      products: [
        {
          id: "prod_test",
          metadata: {
            pawfectly_store_integration_approved_by_user: "YES",
            supplier_url: "https://private.example",
            cost_price: "1.60",
          },
          variants: [
            {
              id: "variant_test",
              metadata: {
                pawfectly_availability_mode: "LOCAL_PREVIEW_AVAILABILITY",
                supplier_sku: "private-supplier-sku",
              },
            },
          ],
        },
      ],
    }) as { products: Array<{ metadata: Record<string, unknown>; variants: Array<{ metadata: Record<string, unknown> }> }> }

    expect(response.products[0].metadata).toEqual({
      pawfectly_store_integration_approved_by_user: "YES",
    })
    expect(response.products[0].variants[0].metadata).toEqual({
      pawfectly_availability_mode: "LOCAL_PREVIEW_AVAILABILITY",
    })
  })

  it("projects a single product response as well as collections", () => {
    const response = projectPublicProductResponse({
      product: {
        metadata: { pawfectly_selling_price_status: "CONFIRMED_BY_USER", hs_code: "private" },
      },
    }) as { product: { metadata: Record<string, unknown> } }

    expect(response.product.metadata).toEqual({ pawfectly_selling_price_status: "CONFIRMED_BY_USER" })
  })

  it("projects nested cart and order product variants", () => {
    const response = projectPublicProductResponse({
      cart: {
        items: [{
          product: { metadata: { supplier_url: "https://private.example", pawfectly_selling_price_status: "CONFIRMED_BY_USER" } },
          variant: { metadata: { cost_price: "1.60", pawfectly_availability_mode: "LOCAL_PREVIEW_AVAILABILITY" } },
        }],
      },
    }) as { cart: { items: Array<{ product: { metadata: Record<string, unknown> }; variant: { metadata: Record<string, unknown> } }> } }

    expect(response.cart.items[0].product.metadata).toEqual({ pawfectly_selling_price_status: "CONFIRMED_BY_USER" })
    expect(response.cart.items[0].variant.metadata).toEqual({ pawfectly_availability_mode: "LOCAL_PREVIEW_AVAILABILITY" })
  })
})
