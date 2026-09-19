"use client";

import { useEffect, useRef } from "react";

/**
 * Llama a `refrescar` cada `ms`. Es la red de seguridad del canal en vivo
 * (SSE): si la conexion se corta o el hosting la retiene, los llamados
 * atendidos y las cuentas igual se actualizan solos, tambien desde una
 * pestaña en segundo plano (el navegador la espacia por su cuenta).
 */
export function useRefrescoPeriodico(refrescar: () => void, ms = 15000) {
  const refrescarRef = useRef(refrescar);
  useEffect(() => {
    refrescarRef.current = refrescar;
  });

  useEffect(() => {
    const id = setInterval(() => refrescarRef.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
