import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { aceptarSolicitud, errorDeSolicitud, rechazarSolicitud } from "@/lib/solicitudes";

// Caja responde un pedido del link:
//   aceptar  -> se crea el pedido (va a cocina y descuenta inventario)   { costoDomicilio? }
//   rechazar -> se le avisa al cliente                                    { motivo? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string; accion: string }> }) {
  try {
    const user = await requireApiUser("caja", "admin");
    const { id, accion } = await params;
    const body = (await req.json().catch(() => ({}))) as { costoDomicilio?: unknown; motivo?: unknown };

    if (accion === "aceptar") {
      const costo = body.costoDomicilio;
      if (costo !== undefined && (!Number.isInteger(costo) || (costo as number) < 0)) {
        return NextResponse.json({ error: "El valor del domicilio debe ser un número entero, 0 o más" }, { status: 400 });
      }
      const resultado = await aceptarSolicitud(user.restauranteId, id, { costoDomicilio: costo as number | undefined });
      return NextResponse.json(resultado);
    }
    if (accion === "rechazar") {
      await rechazarSolicitud(user.restauranteId, id, typeof body.motivo === "string" ? body.motivo : undefined);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acción desconocida" }, { status: 404 });
  } catch (error) {
    const conocido = errorDeSolicitud(error);
    if (conocido) return NextResponse.json(conocido.body, { status: conocido.status });
    return apiErrorResponse(error);
  }
}
