import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { suscribirse } from "@/lib/realtime";
import { filtrarEventoParaMesero, type EventoTiempoReal } from "@/lib/eventos-acceso";

// Necesita el runtime de Node (no Edge): usa el EventEmitter en memoria de
// src/lib/realtime.ts, y debe poder mantener la conexion abierta por
// minutos/horas -- ver arquitectura-backend.md sec. 12 para el porque de
// SSE sobre un servidor Node persistente en vez de funciones serverless.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("No autenticado", { status: 401 });

  const { restauranteId, rol, usuarioId } = session.user;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let cerrado = false;

      const enviar = (evento: EventoTiempoReal) => {
        if (cerrado) return;
        controller.enqueue(encoder.encode(`event: ${evento.tipo}\ndata: ${JSON.stringify(evento.payload)}\n\n`));
      };

      // Los meseros reciben los eventos filtrados por mesa (consulta a la BD),
      // asi que se encadenan para conservar el orden en que ocurrieron.
      let cola: Promise<void> = Promise.resolve();
      const alLlegarEvento = (evento: EventoTiempoReal) => {
        if (rol !== "mesero") return enviar(evento);
        cola = cola
          .then(() => filtrarEventoParaMesero(usuarioId, evento))
          .then((filtrado) => {
            if (filtrado) enviar(filtrado);
          })
          .catch(() => {});
      };

      // Comentario de apertura: fuerza a que el navegador confirme la
      // conexion de inmediato (algunos proxies/CDN bufferizan hasta el
      // primer byte de contenido real).
      controller.enqueue(encoder.encode(": conectado\n\n"));

      const cancelarSuscripcion = suscribirse(restauranteId, alLlegarEvento);

      const keepAlive = setInterval(() => {
        if (!cerrado) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 25000);

      req.signal.addEventListener("abort", () => {
        cerrado = true;
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
