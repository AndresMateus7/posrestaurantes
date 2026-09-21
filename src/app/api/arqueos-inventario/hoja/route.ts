import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { hojaDeConteo } from "@/lib/arqueos";

// Hoja para contar: nombre, unidad y ubicacion de cada producto e insumo. A proposito NO trae cuanto
// hay en el sistema, el minimo ni el costo: el conteo es a ciegas para que nadie "ajuste" lo que cuenta.
export async function GET() {
  try {
    const user = await requireApiUser("caja", "admin");
    return NextResponse.json(await hojaDeConteo(user.restauranteId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
