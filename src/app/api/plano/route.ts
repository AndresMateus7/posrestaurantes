import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { emitirEvento } from "@/lib/realtime";

type ElementoPlano = {
  id: string;
  tipo: "mesa" | "barra" | "pared" | "caja" | "cocina" | "decoracion";
  forma?: "cuadrada" | "redonda" | "rectangular";
  x: number;
  y: number;
  ancho: number;
  alto: number;
  rotacion: number;
};

async function obtenerOCrearPlano(restauranteId: string) {
  const existente = await prisma.plano.findFirst({ where: { restauranteId } });
  if (existente) return existente;
  return prisma.plano.create({ data: { restauranteId, nombre: "Principal", layout: [] } });
}

export async function GET() {
  try {
    const user = await requireApiUser();
    const plano = await obtenerOCrearPlano(user.restauranteId);
    // `mesero` (nombre) permite mostrar quien atiende cada mesa en el mapa.
    const mesas = await prisma.mesa.findMany({ where: { planoId: plano.id }, include: { mesero: { select: { nombre: true } } } });
    return NextResponse.json({ plano, mesas });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// Guarda el lienzo completo (arquitectura-backend.md sec. 4: el editor
// mantiene el estado en el cliente y hace PUT del array entero en cada
// cambio) y sincroniza la tabla `mesas`: crea el registro operativo de las
// figuras tipo "mesa" nuevas, y borra el de las que ya no estan en el layout.
export async function PUT(req: Request) {
  try {
    const user = await requireApiUser("admin");
    const { layout } = (await req.json()) as { layout?: ElementoPlano[] };
    if (!Array.isArray(layout)) return NextResponse.json({ error: "layout debe ser un array" }, { status: 400 });

    const plano = await obtenerOCrearPlano(user.restauranteId);
    const mesasActuales = await prisma.mesa.findMany({ where: { planoId: plano.id } });
    const idsEnLayout = new Set(layout.filter((f) => f.tipo === "mesa").map((f) => f.id));
    const idsExistentes = new Set(mesasActuales.map((m) => m.elementoId));

    const numerosUsados = mesasActuales.map((m) => Number(m.numero)).filter((n) => !Number.isNaN(n));
    let siguienteNumero = (numerosUsados.length ? Math.max(...numerosUsados) : 0) + 1;

    await prisma.$transaction(async (tx) => {
      await tx.plano.update({ where: { id: plano.id }, data: { layout } });

      for (const figura of layout) {
        if (figura.tipo === "mesa" && !idsExistentes.has(figura.id)) {
          await tx.mesa.create({
            data: {
              restauranteId: user.restauranteId,
              planoId: plano.id,
              elementoId: figura.id,
              numero: String(siguienteNumero++),
              capacidad: 4,
              estado: "libre",
            },
          });
        }
      }

      const idsABorrar = mesasActuales.filter((m) => !idsEnLayout.has(m.elementoId)).map((m) => m.id);
      if (idsABorrar.length > 0) {
        await tx.mesa.deleteMany({ where: { id: { in: idsABorrar } } });
      }
    });

    const mesas = await prisma.mesa.findMany({ where: { planoId: plano.id } });
    emitirEvento(user.restauranteId, "plano-actualizado", { layout, mesas });
    return NextResponse.json({ ok: true, mesas });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
