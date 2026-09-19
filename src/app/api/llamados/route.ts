import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { filtroMesasVisibles } from "@/lib/acceso-mesas";

// Un mesero solo recibe los llamados de sus mesas o de mesas que nadie atiende
// aun; caja y admin ven todos (ver src/lib/acceso-mesas.ts), con el nombre del
// mesero que atiende cada mesa.
export async function GET() {
  try {
    const user = await requireApiUser();
    const llamados = await prisma.llamadoMesa.findMany({
      where: { restauranteId: user.restauranteId, atendido: false, mesa: filtroMesasVisibles(user) },
      include: { mesa: { include: { mesero: { select: { nombre: true } } } } },
      orderBy: { creadoEn: "desc" },
    });
    return NextResponse.json(
      llamados.map((l) => ({
        id: l.id,
        tipo: l.tipo,
        mesaNumero: l.mesa.numero,
        meseroNombre: l.mesa.mesero?.nombre ?? null,
        comentario: l.comentario,
        creadoEn: l.creadoEn,
      }))
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
