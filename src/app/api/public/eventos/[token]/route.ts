import { prisma } from "@/lib/prisma";
import { suscribirse } from "@/lib/realtime";
import { filtrarEventoPublico } from "@/lib/eventos-acceso";

// Version publica de /api/eventos: el cliente final no tiene sesion, se
// autoriza solo con su qr_token (igual que el resto de /api/public/*).
// Necesario para que, con rota_qr=false, el banner de "mesa cerrada" se
// quite solo cuando el mesero la abre -- sin esto el cliente tendria que
// refrescar la pagina a mano.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const mesa = await prisma.mesa.findUnique({ where: { qrToken: token } });
  if (!mesa) return new Response("Mesa no encontrada", { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Solo pasan los eventos que el menu necesita para refrescarse, y sin
      // contenido: este canal no tiene sesion, asi que nunca debe filtrar
      // pedidos ni llamados de otras mesas.
      const enviar = (original: { tipo: string; payload: unknown }) => {
        const evento = filtrarEventoPublico(original);
        if (!evento) return;
        controller.enqueue(encoder.encode(`event: ${evento.tipo}\ndata: ${JSON.stringify(evento.payload)}\n\n`));
      };
      controller.enqueue(encoder.encode(": conectado\n\n"));

      const cancelarSuscripcion = suscribirse(mesa.restauranteId, enviar);
      const keepAlive = setInterval(() => controller.enqueue(encoder.encode(": keep-alive\n\n")), 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        cancelarSuscripcion();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
