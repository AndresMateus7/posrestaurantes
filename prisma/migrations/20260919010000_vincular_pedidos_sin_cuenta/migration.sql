-- Solo datos, sin cambios de esquema. Los pedidos de demostracion del seed (y
-- cualquier pedido antiguo) quedaron sin cuenta (cuenta_id NULL), asi que Caja
-- no los listaba en "Cuentas por cobrar". Se crea una cuenta abierta por mesa
-- (si no tiene ya una activa), se enlazan esos pedidos y se calcula su total
-- igual que recalcularCuenta() (items + adicionales). Es idempotente.
INSERT INTO "cuentas" ("id", "restaurante_id", "mesa_id", "estado", "subtotal", "propina", "total", "creado_en")
SELECT gen_random_uuid()::text, p."restaurante_id", p."mesa_id", 'abierta'::"EstadoCuenta", 0, 0, 0, MIN(p."creado_en")
FROM "pedidos" p
WHERE p."cuenta_id" IS NULL AND p."estado" <> 'cancelado'
  AND NOT EXISTS (SELECT 1 FROM "cuentas" c WHERE c."mesa_id" = p."mesa_id" AND c."estado" IN ('abierta', 'dividida'))
GROUP BY p."restaurante_id", p."mesa_id";

UPDATE "pedidos" p
SET "cuenta_id" = c."id"
FROM "cuentas" c
WHERE p."cuenta_id" IS NULL AND p."estado" <> 'cancelado'
  AND c."mesa_id" = p."mesa_id" AND c."estado" IN ('abierta', 'dividida');

UPDATE "cuentas" c
SET "subtotal" = t.subtotal, "total" = t.subtotal + c."propina"
FROM (
  SELECT p."cuenta_id" AS cuenta_id,
         COALESCE(SUM(i."precio_unitario" * i."cantidad"), 0) + COALESCE(SUM(a.extras), 0) AS subtotal
  FROM "pedidos" p
  JOIN "items_pedido" i ON i."pedido_id" = p."id"
  LEFT JOIN (
    SELECT "item_pedido_id", SUM("precio_unitario" * "cantidad") AS extras
    FROM "item_pedido_adicionales" GROUP BY "item_pedido_id"
  ) a ON a."item_pedido_id" = i."id"
  WHERE p."cuenta_id" IS NOT NULL
  GROUP BY p."cuenta_id"
) t
WHERE c."id" = t.cuenta_id AND c."estado" IN ('abierta', 'dividida') AND c."subtotal" = 0;
