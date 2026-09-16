import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { suscribirse } from "@/lib/realtime";

// Necesita el runtime de Node (no Edge): usa el EventEmitter en memoria de
// src/lib/realtime.ts, y debe poder mantener la conexion abierta por
// minutos/horas -- ver arquitectura-backend.md sec. 12 para el porque de
// SSE sobre un servidor Node persistente en vez de funciones serverless.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("No autenticado", { status: 401 });

  const restauranteId = session.user.restauranteId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const enviar = (evento: { tipo: string; payload: unknown }) => {
        controller.enqueue(encoder.encode(`event: ${evento.tipo}\ndata: ${JSON.stringify(evento.payload)}\n\n`));
      };

      // Comentario de apertura: fuerza a que el navegador confirme la
      // conexion de inmediato (algunos proxies/CDN bufferizan hasta el
      // primer byte de contenido real).
      controller.enqueue(encoder.encode(": conectado\n\n"));

      const cancelarSuscripcion = suscribirse(restauranteId, enviar);

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        cancelarSuscripcion();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
