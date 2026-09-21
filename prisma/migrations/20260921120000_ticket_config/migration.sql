-- Diseno del ticket de impresion (JSON con las opciones del restaurante).
-- Solo AGREGA una columna opcional: sin valor se usan los valores por defecto del codigo.

-- AlterTable
ALTER TABLE "restaurantes" ADD COLUMN     "ticket_config" JSONB;
