import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { dividirCuenta } from "@/lib/cuentas";

type Body =
  | { tipo: "partes_iguales"; numeroPartes: number }
  | { tipo: "por_items"; asignaciones: { etiqueta: string; itemPedidoId: string; cantidad: number }[] };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("caja", "admin");
    const { id } = await params;
    const body = (await req.json()) as Body;

    if (body.tipo !== "partes_iguales" && body.tipo !== "por_items") {
      return NextResponse.json({ error: "tipo invalido" }, { status: 400 });
    }

    const subCuentas = await dividirCuenta(user.restauranteId, id, body);
    return NextResponse.json(subCuentas);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
