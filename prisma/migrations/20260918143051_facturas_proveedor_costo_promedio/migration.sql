-- AlterTable
ALTER TABLE "ingredientes" ADD COLUMN     "costo_promedio" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "facturas_proveedor" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "numero_factura" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" INTEGER NOT NULL DEFAULT 0,
    "registrado_por_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facturas_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factura_proveedor_items" (
    "id" TEXT NOT NULL,
    "factura_id" TEXT NOT NULL,
    "ingrediente_id" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "costo_unitario" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,

    CONSTRAINT "factura_proveedor_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "facturas_proveedor_restaurante_id_fecha_idx" ON "facturas_proveedor"("restaurante_id", "fecha");

-- CreateIndex
CREATE INDEX "factura_proveedor_items_factura_id_idx" ON "factura_proveedor_items"("factura_id");

-- AddForeignKey
ALTER TABLE "facturas_proveedor" ADD CONSTRAINT "facturas_proveedor_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_proveedor" ADD CONSTRAINT "facturas_proveedor_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura_proveedor_items" ADD CONSTRAINT "factura_proveedor_items_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas_proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura_proveedor_items" ADD CONSTRAINT "factura_proveedor_items_ingrediente_id_fkey" FOREIGN KEY ("ingrediente_id") REFERENCES "ingredientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
