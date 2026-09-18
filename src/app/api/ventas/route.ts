import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { listarHistorialVentas } from "@/lib/estadisticas";

export async function GET(req: Request) {
  try {
    const user = await requireApiUser("admin", "caja");
    const { searchParams } = new URL(req.url);
    const ahora = new Date();
    const desdeParam = searchParams.get("desde");
    const hastaParam = searchParams.get("hasta");

    const hasta = hastaParam ? new Date(hastaParam) : ahora;
    const desde = desdeParam ? new Date(desdeParam) : new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
      return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
    }

    const ventas = await listarHistorialVentas(user.restauranteId, { desde, hasta });
    return NextResponse.json(ventas);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
