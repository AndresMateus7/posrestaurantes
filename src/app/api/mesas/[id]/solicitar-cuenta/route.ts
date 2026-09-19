import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { asegurarAccesoMesa } from "@/lib/acceso-mesas";
import { contarConsumoActivo } from "@/lib/mesas";
import { crearLlamado } from "@/lib/llamados";

// "Cerrar cuenta" del mesero/caja: la mesa pasa a "cuenta solicitada" y en Caja
// queda marcada como cuenta cerrada, con su valor, lista para cobrar. Version
// autenticada de POST /api/public/mesas/:token/solicitar-cuenta (la del cliente).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("mesero", "admin", "caja");
    const { id } = await params;
    const mesa = await asegurarAccesoMesa(user.restauranteId, user, id);

    if (mesa.estado === "libre" || mesa.estado === "reservada") {
      return NextResponse.json({ error: "La mesa no está abierta" }, { status: 409 });
    }
    // Ya cerrada: no se genera otro aviso a caja (evita duplicados por doble clic).
    if (mesa.estado === "cuenta_solicitada") return NextResponse.json({ ok: true, yaCerrada: true });
    if ((await contarConsumoActivo(id)) === 0) {
      return NextResponse.json({ error: 'La mesa no tiene consumo: usa "Liberar mesa"' }, { status: 409 });
    }

    const llamado = await crearLlamado(user.restauranteId, id, "solicitar_cuenta");
    return NextResponse.json({ ok: true, llamadoId: llamado.id });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
