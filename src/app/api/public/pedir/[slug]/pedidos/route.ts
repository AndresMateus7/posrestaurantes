import { NextResponse } from "next/server";
import { excedeLimite, ipDe } from "@/lib/limite";
import { crearSolicitud, errorDeSolicitud, type DatosSolicitud } from "@/lib/solicitudes";

// El cliente manda su pedido por el link publico: queda como solicitud hasta que caja lo acepte.
// Sin sesion, asi que lleva frenos: limite por IP y por telefono, un campo trampa para bots
// y un tope de pedidos en espera (ver src/lib/solicitudes.ts).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const ip = ipDe(req);
    if (ip && excedeLimite(`pedir:${ip}`, 6, 15 * 60_000)) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos", codigo: "limite" }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as (DatosSolicitud & { website?: unknown }) | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });

    // Campo trampa: los bots lo llenan, las personas no lo ven. Se responde "ok" sin guardar nada.
    if (typeof body.website === "string" && body.website.trim() !== "") return NextResponse.json({ id: null }, { status: 201 });

    const digitos = String(body.telefono ?? "").replace(/\D/g, "");
    if (digitos.length >= 7 && excedeLimite(`pedir-tel:${digitos}`, 4, 30 * 60_000)) {
      return NextResponse.json({ error: "Ya enviaste varios pedidos, espera unos minutos", codigo: "limite" }, { status: 429 });
    }

    const resultado = await crearSolicitud(slug, body);
    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    const conocido = errorDeSolicitud(error);
    if (conocido) return NextResponse.json(conocido.body, { status: conocido.status });
    console.error(error);
    return NextResponse.json({ error: "No se pudo enviar el pedido" }, { status: 500 });
  }
}
