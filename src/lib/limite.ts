// Freno sencillo para los endpoints publicos (sin sesion): cuenta los intentos de una clave (la IP, un
// telefono...) dentro de una ventana de tiempo, en la memoria del servidor. No detiene a un ataque
// distribuido, pero corta el spam facil de un mismo dispositivo.
const golpes = new Map<string, number[]>();

/** Registra un intento y dice si esa clave ya paso el maximo en la ventana (en ese caso no cuenta el intento). */
export function excedeLimite(clave: string, maximo: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  const recientes = (golpes.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
  if (recientes.length >= maximo) {
    golpes.set(clave, recientes);
    return true;
  }
  recientes.push(ahora);
  golpes.set(clave, recientes);

  // Limpieza ocasional para que el mapa no crezca sin fin.
  if (golpes.size > 5000) {
    for (const [k, marcas] of golpes) if (!marcas.some((t) => ahora - t < ventanaMs)) golpes.delete(k);
  }
  return false;
}

/**
 * IP de quien llama (detras del proxy del hosting viene en x-forwarded-for). Si no hay forma de saberla
 * devuelve null: quien llama no debe limitar por IP, porque todos los clientes compartirian el mismo freno.
 */
export function ipDe(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}
