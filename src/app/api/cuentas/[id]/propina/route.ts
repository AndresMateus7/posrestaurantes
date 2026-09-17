import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { registrarPropina } from "@/lib/cuentas";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("caja", "admin");
    const { id } = await params;
    const body = (await req.json()) as { monto?: number; porcentaje?: number };

    if (body.monto == null && body.porcentaje == null) {
      return NextResponse.json({ error: "monto o porcentaje es requerido" }, { status: 400 });
    }

    const cuenta = await registrarPropina(user.restauranteId, id, body);
    return NextResponse.json(cuenta);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
