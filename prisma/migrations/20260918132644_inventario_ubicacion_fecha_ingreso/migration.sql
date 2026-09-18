-- AlterTable
ALTER TABLE "ingredientes" ADD COLUMN     "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ubicacion" TEXT;
