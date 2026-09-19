-- Pedidos para llevar y a domicilio (los saca caja): pedidos y cuentas sin mesa, con los datos del cliente.
-- Solo AMPLIA el esquema: columnas nuevas con valor por defecto y mesa_id que ahora admite NULL.
-- El codigo anterior sigue funcionando (nunca ve filas sin mesa hasta que se despliegue el nuevo).

-- CreateEnum
CREATE TYPE "TipoServicio" AS ENUM ('mesa', 'llevar', 'domicilio');

-- AlterTable
ALTER TABLE "restaurantes" ADD COLUMN "contador_pedidos_externos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "contador_dia" TEXT;

-- AlterTable
ALTER TABLE "pedidos" ALTER COLUMN "mesa_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "cuentas" ALTER COLUMN "mesa_id" DROP NOT NULL,
ADD COLUMN "costo_domicilio" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "tipo" "TipoServicio" NOT NULL DEFAULT 'mesa',
ADD COLUMN "numero" INTEGER,
ADD COLUMN "cliente_nombre" TEXT,
ADD COLUMN "cliente_telefono" TEXT,
ADD COLUMN "direccion" TEXT,
ADD COLUMN "domiciliario" TEXT,
ADD COLUMN "notas" TEXT,
ADD COLUMN "despachado_en" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "cuentas_restaurante_id_tipo_idx" ON "cuentas"("restaurante_id", "tipo");
