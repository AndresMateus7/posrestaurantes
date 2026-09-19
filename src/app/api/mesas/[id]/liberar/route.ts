import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { asegurarAccesoMesa } from "@/lib/acceso-mesas";
import { contarConsumoActivo } from "@/lib/mesas";
import { resolverLlamadosDeMesa } from "@/lib/llamados";
import { emitirEvento } from "@/lib/realtime";

// Libera una mesa que se abrio pero no consumio nada (los clientes se fueron,
// se abrio por error...). Si ya tiene consumo hay que cerrarla con su cuenta y
// cobrarla en caja, para que la venta no se pierda.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("mesero", "admin", "caja");
    const { id } = await params;
    const mesa = await asegurarAccesoMesa(user.restauranteId, user, id);

    if ((await contarConsumoActivo(id)) > 0) {
      return NextResponse.json({ error: 'La mesa tiene consumo: ciérrala con "Cerrar cuenta" y cóbrala en Caja' }, { status: 409 });
    }

    await prisma.$transaction([
      prisma.cuenta.updateMany({ where: { mesaId: id, estado: { in: ["abierta", "dividida"] } }, data: { estado: "anulada", cerradoEn: new Date() } }),
      prisma.mesa.update({ where: { id }, data: { estado: "libre", meseroId: null } }),
    ]);
    await resolverLlamadosDeMesa(user.restauranteId, id, user.usuarioId);

    emitirEvento(user.restauranteId, "mesa-actualizada", { mesaId: id, numero: mesa.numero, estado: "libre" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
