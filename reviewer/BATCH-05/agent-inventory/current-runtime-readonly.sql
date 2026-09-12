BEGIN TRANSACTION READ ONLY;

SELECT id, handle, status,
       metadata->>'pawfectly_availability_mode' AS availability_mode,
       metadata->>'pawfectly_project_owned_inventory' AS owned_inventory
FROM product
WHERE id = 'prod_01M1JG54Z6PFY802QV32EJ174D';

SELECT id, sku, manage_inventory
FROM product_variant
WHERE product_id = 'prod_01M1JG54Z6PFY802QV32EJ174D'
  AND deleted_at IS NULL;

SELECT pvi.variant_id, pvi.inventory_item_id, pvi.required_quantity
FROM product_variant_inventory_item pvi
WHERE pvi.variant_id = 'variant_01M1JG551ZEBATMPNNTW138YSE'
  AND pvi.deleted_at IS NULL;

SELECT il.inventory_item_id, il.location_id,
       il.stocked_quantity, il.reserved_quantity,
       (il.stocked_quantity - il.reserved_quantity) AS simple_available
FROM inventory_level il
WHERE il.inventory_item_id IN (
  SELECT inventory_item_id
  FROM product_variant_inventory_item
  WHERE variant_id = 'variant_01M1JG551ZEBATMPNNTW138YSE'
    AND deleted_at IS NULL
)
AND il.deleted_at IS NULL;

SELECT id, name FROM stock_location WHERE deleted_at IS NULL ORDER BY id;
SELECT id, name, is_disabled FROM sales_channel WHERE deleted_at IS NULL ORDER BY id;
SELECT sales_channel_id, stock_location_id
FROM sales_channel_stock_location
WHERE deleted_at IS NULL ORDER BY sales_channel_id, stock_location_id;
SELECT product_id, sales_channel_id
FROM product_sales_channel
WHERE product_id = 'prod_01M1JG54Z6PFY802QV32EJ174D'
  AND deleted_at IS NULL;

SELECT 'product' AS entity, jsonb_object_keys(metadata) AS metadata_key
FROM product WHERE id = 'prod_01M1JG54Z6PFY802QV32EJ174D'
UNION ALL
SELECT 'variant' AS entity, jsonb_object_keys(metadata) AS metadata_key
FROM product_variant WHERE id = 'variant_01M1JG551ZEBATMPNNTW138YSE'
ORDER BY entity, metadata_key;

COMMIT;
