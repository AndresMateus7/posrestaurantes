-- Arqueo (conteo fisico) de inventario: una persona cuenta a ciegas y el administrador revisa y ajusta.
-- Solo AGREGA: dos enums y dos tablas nuevas; no toca ninguna tabla existente.

-- CreateEnum
CREATE TYPE "EstadoArqueo" AS ENUM ('pendiente', 'cerrado');

-- CreateEnum
CREATE TYPE "EstadoLineaArqueo" AS ENUM ('pendiente', 'confirmada', 'editada', 'omitida', 'sin_contar');

-- CreateTable
CREATE TABLE "arqueos_inventario" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "creado_por_id" TEXT,
    "creado_por_nombre" TEXT NOT NULL,
    "nota" TEXT,
    "estado" "EstadoArqueo" NOT NULL DEFAULT 'pendiente',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrado_en" TIMESTAMP(3),
    "cerrado_por_nombre" TEXT,

    CONSTRAINT "arqueos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineas_arqueo_inventario" (
    "id" TEXT NOT NULL,
    "arqueo_id" TEXT NOT NULL,
    "ingrediente_id" TEXT,
    "nombre" TEXT NOT NULL,
    "unidad_medida" TEXT NOT NULL,
    "ubicacion" TEXT,
    "es_producto" BOOLEAN NOT NULL DEFAULT false,
    "costo_unidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "esperado" DECIMAL(10,2) NOT NULL,
    "contado" DECIMAL(10,2),
    "estado" "EstadoLineaArqueo" NOT NULL DEFAULT 'pendiente',
    "cantidad_final" DECIMAL(10,2),
    "ajuste" DECIMAL(10,2),
    "resuelto_en" TIMESTAMP(3),

    CONSTRAINT "lineas_arqueo_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arqueos_inventario_restaurante_id_estado_idx" ON "arqueos_inventario"("restaurante_id", "estado");

-- CreateIndex
CREATE INDEX "arqueos_inventario_restaurante_id_creado_en_idx" ON "arqueos_inventario"("restaurante_id", "creado_en");

-- CreateIndex
CREATE INDEX "lineas_arqueo_inventario_arqueo_id_idx" ON "lineas_arqueo_inventario"("arqueo_id");

-- CreateIndex
CREATE INDEX "lineas_arqueo_inventario_ingrediente_id_idx" ON "lineas_arqueo_inventario"("ingrediente_id");

-- AddForeignKey
ALTER TABLE "arqueos_inventario" ADD CONSTRAINT "arqueos_inventario_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_arqueo_inventario" ADD CONSTRAINT "lineas_arqueo_inventario_arqueo_id_fkey" FOREIGN KEY ("arqueo_id") REFERENCES "arqueos_inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_arqueo_inventario" ADD CONSTRAINT "lineas_arqueo_inventario_ingrediente_id_fkey" FOREIGN KEY ("ingrediente_id") REFERENCES "ingredientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
