-- Costos con decimales para el valor del inventario y el costo de las recetas.
-- Solo AGREGA columnas (con valor por defecto): el codigo anterior sigue funcionando
-- con las columnas enteras mientras se despliega el nuevo.

-- AlterTable
ALTER TABLE "ingredientes" ADD COLUMN "costo_unidad" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "factura_proveedor_items" ADD COLUMN "costo_por_unidad" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Los costos que ya existieran pasan a las columnas nuevas (hoy no hay ninguno, pero por si acaso).
UPDATE "ingredientes" SET "costo_unidad" = "costo_promedio";
UPDATE "factura_proveedor_items" SET "costo_por_unidad" = "costo_unitario";
