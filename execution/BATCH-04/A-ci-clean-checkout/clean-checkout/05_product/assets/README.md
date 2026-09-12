# Product Asset Contract

Asset roles align with the frozen storefront `ASSET/*` contract:

- `MAIN`: primary product image used by PDP and listing surfaces.
- `GALLERY/*`: product detail, scale, context or material images.
- `LIFESTYLE/*`: approved real-product lifestyle images for editorial surfaces.
- `THUMBNAIL`: compact listing/cart/checkout image.

The Product Master stores references and provenance; UI components continue to
read the Medusa product image fields. Do not hardcode image URLs in storefront
components. Missing assets remain unknown/neutral slots until real imagery is
approved. AI may assist with background cleanup or extension only when the real
product appearance is preserved; it must not fabricate the product itself.

The first approved source asset is `source/COMP-001-main-square.png`, a
user-provided 1:1 primary product image for COMP-001. The previous wide
`source/COMP-001-source-product-clean.png` is preserved as a secondary
lifestyle/source evidence asset and is not the primary product image.
