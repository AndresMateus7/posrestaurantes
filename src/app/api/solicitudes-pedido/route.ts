import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { listarSolicitudesPendientes } from "@/lib/solicitudes";

// Pedidos que los clientes mandaron por el link y esperan respuesta de caja.
export async function GET() {
  try {
    const user = await requireApiUser("caja", "admin");
    return NextResponse.json(await listarSolicitudesPendientes(user.restauranteId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
