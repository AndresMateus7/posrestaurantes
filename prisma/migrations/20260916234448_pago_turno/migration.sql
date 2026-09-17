-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "turno_id" TEXT;

-- CreateIndex
CREATE INDEX "pagos_turno_id_idx" ON "pagos"("turno_id");

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turnos_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
