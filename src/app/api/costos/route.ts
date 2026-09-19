import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { obtenerCostos } from "@/lib/costos";

// Costo de cada plato (segun su receta) y de cada adicional, para revisar margenes y
// fijar precios. Solo el administrador.
export async function GET() {
  try {
    const user = await requireApiUser("admin");
    return NextResponse.json(await obtenerCostos(user.restauranteId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
