"use client";

import { useEffect, useRef } from "react";

type ManejadorEvento = (payload: unknown) => void;

/**
 * Se suscribe a GET /api/eventos (SSE) y llama al manejador correspondiente
 * segun el "tipo" de evento (nombre del "event:" de la linea SSE). Un solo
 * EventSource por pantalla, sin importar cuantos tipos de evento le
 * interesen.
 */
export function useEventos(manejadores: Record<string, ManejadorEvento>) {
  const manejadoresRef = useRef(manejadores);
  manejadoresRef.current = manejadores;

  useEffect(() => {
    const eventSource = new EventSource("/api/eventos");

    const listeners = Object.keys(manejadoresRef.current).map((tipo) => {
      const listener = (e: MessageEvent) => {
        try {
          manejadoresRef.current[tipo]?.(JSON.parse(e.data));
        } catch {
          // ignorar mensajes que no sean JSON (comentarios de keep-alive)
        }
      };
      eventSource.addEventListener(tipo, listener);
      return { tipo, listener };
    });

    return () => {
      listeners.forEach(({ tipo, listener }) => eventSource.removeEventListener(tipo, listener));
      eventSource.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
