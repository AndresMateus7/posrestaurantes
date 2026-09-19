-- Pedidos por el link publico (/pedir/<slug>): el cliente manda su pedido y caja lo acepta o rechaza.
-- Solo AGREGA: una tabla nueva y columnas con valor por defecto (el link queda apagado hasta activarlo).

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('pendiente', 'aceptada', 'rechazada');

-- AlterTable
ALTER TABLE "restaurantes" ADD COLUMN "pedidos_web_activos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "costo_domicilio_base" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "solicitudes_pedido" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "tipo" "TipoServicio" NOT NULL,
    "cliente_nombre" TEXT NOT NULL,
    "cliente_telefono" TEXT NOT NULL,
    "direccion" TEXT,
    "notas" TEXT,
    "pago" TEXT,
    "paga_con" INTEGER,
    "items" JSONB NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "costo_domicilio" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'pendiente',
    "motivo_rechazo" TEXT,
    "cuenta_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondido_en" TIMESTAMP(3),

    CONSTRAINT "solicitudes_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_pedido_cuenta_id_key" ON "solicitudes_pedido"("cuenta_id");

-- CreateIndex
CREATE INDEX "solicitudes_pedido_restaurante_id_estado_idx" ON "solicitudes_pedido"("restaurante_id", "estado");

-- AddForeignKey
ALTER TABLE "solicitudes_pedido" ADD CONSTRAINT "solicitudes_pedido_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_pedido" ADD CONSTRAINT "solicitudes_pedido_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
