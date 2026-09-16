import { EventEmitter } from "events";

/**
 * Bus de eventos en memoria, con alcance a un solo proceso de Node.
 *
 * arquitectura-backend.md (sec. 12) diseña esto sobre SSE + Postgres
 * LISTEN/NOTIFY para poder escalar a varias instancias del servidor. Esta
 * app corre como UN solo proceso Node persistente en Hostinger (no
 * serverless multi-instancia), así que un EventEmitter en memoria logra
 * exactamente el mismo resultado (todo dispositivo conectado por SSE
 * recibe el evento al instante) con muchísima menos complejidad.
 *
 * Si en el futuro se despliegan varias instancias del servidor, este
 * archivo es el único lugar que habría que cambiar: reemplazar el emitter
 * por LISTEN/NOTIFY (o Redis pub/sub) sin tocar los route handlers que lo
 * usan.
 */

type EventoTiempoReal = {
  tipo: string;
  payload: unknown;
};

const bus = new EventEmitter();
bus.setMaxListeners(0); // sin limite: puede haber muchos dispositivos conectados a la vez

function canal(restauranteId: string) {
  return `restaurante:${restauranteId}`;
}

export function emitirEvento(restauranteId: string, tipo: string, payload: unknown) {
  bus.emit(canal(restauranteId), { tipo, payload } satisfies EventoTiempoReal);
}

export function suscribirse(restauranteId: string, callback: (evento: EventoTiempoReal) => void) {
  bus.on(canal(restauranteId), callback);
  return () => bus.off(canal(restauranteId), callback);
}
