// Calculos del arqueo (conteo fisico) de inventario. Es logica pura (sin base de datos), asi que la usan
// igual el servidor (src/lib/arqueos.ts) y las pantallas (para mostrar lo mismo que se va a aplicar).

export type Semaforo = "verde" | "amarillo" | "rojo";

// Al pesar o medir a ojo, hasta 2 % de diferencia se considera que "coincide"; hasta 10 % es una
// diferencia leve; mas que eso es importante. Lo que se cuenta por unidades (botellas, latas) no tiene
// tolerancia: si falta una, se nota.
export const TOLERANCIA_PESO = 0.02;
export const LIMITE_LEVE = 0.1;
export const MAX_CANTIDAD = 99_999_999.99;

export const redondear = (n: number) => Math.round(n * 100) / 100;

// Motivo con el que el panel de Inventario registra una correccion de stock a mano. El arqueo lo usa
// para saber que ese insumo ya se corrigio despues del conteo (ver calcularAjuste).
export const MOTIVO_AJUSTE_MANUAL = "Ajuste manual desde panel";

/** Semaforo de la diferencia entre lo que decia el sistema (esperado) y lo que se conto. */
export function semaforoDiferencia(esperado: number, contado: number, unidad: string): Semaforo {
  const dif = Math.abs(contado - esperado);
  if (dif < 0.005) return "verde";
  const pct = dif / Math.max(Math.abs(esperado), Math.abs(contado));
  if (unidad !== "unidad" && pct <= TOLERANCIA_PESO) return "verde";
  return pct <= LIMITE_LEVE ? "amarillo" : "rojo";
}

export type NivelStock = "agotado" | "bajo" | "ok";

/** Nivel de existencias frente al minimo (igual que el estado del panel de Inventario). */
export function nivelStock(cantidad: number, minimo: number): NivelStock {
  if (cantidad <= 0) return "agotado";
  if (cantidad < minimo) return "bajo";
  return "ok";
}

/**
 * Ajuste que hay que aplicar al stock cuando el administrador confirma una linea del conteo.
 *
 * El conteo dice como estaba el inventario en ese momento (`esperado` era lo que decia el sistema,
 * `final` es lo real). Entre el conteo y la revision pudo haber ventas o compras, que ya estan en
 * `stockAhora`: por eso no se pisa el stock con el numero contado, se le suma la diferencia
 * (`final - esperado`). Si despues del conteo ya se corrigio ese insumo a mano o con otro conteo
 * (`ajustesDespues`), esa parte no se vuelve a aplicar. Nunca deja el stock en negativo.
 */
export function calcularAjuste(p: { esperado: number; final: number; stockAhora: number; ajustesDespues: number }): { delta: number; quedaEn: number } {
  const bruto = p.final - p.esperado - p.ajustesDespues;
  const quedaEn = Math.max(0, redondear(p.stockAhora + bruto));
  return { delta: redondear(quedaEn - p.stockAhora), quedaEn };
}

/** Unidades en las que se puede escribir lo contado; `factor` lo pasa a la unidad del inventario. */
export function opcionesDeUnidad(unidadMedida: string): { etiqueta: string; factor: number }[] {
  if (unidadMedida === "g") return [{ etiqueta: "g", factor: 1 }, { etiqueta: "kg", factor: 1000 }];
  if (unidadMedida === "ml") return [{ etiqueta: "ml", factor: 1 }, { etiqueta: "L", factor: 1000 }];
  return [{ etiqueta: unidadMedida, factor: 1 }];
}

/** Cantidad legible: 12500 g -> "12,5 kg", 2000 ml -> "2 L", 24 unidad -> "24 unidad". */
export function formatoCantidad(valor: number, unidadMedida: string): string {
  const abs = Math.abs(valor);
  const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
  if (unidadMedida === "g" && abs >= 1000) return `${fmt(valor / 1000)} kg`;
  if (unidadMedida === "ml" && abs >= 1000) return `${fmt(valor / 1000)} L`;
  return `${fmt(valor)} ${unidadMedida}`;
}

/**
 * Lee una cantidad escrita a mano ("2,5" o "2.5"). "vacio" si no escribio nada; "invalido" si no es un
 * numero valido. Tambien es invalido "1.500" (punto + tres cifras): en Colombia es mil quinientos, pero
 * la bascula lo muestra como 1,5; se pide corregirlo antes de que entre un conteo 1000 veces errado.
 */
export function leerCantidad(texto: string): number | "vacio" | "invalido" {
  const original = texto.trim();
  if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(original)) return "invalido";
  const limpio = original.replace(",", ".");
  if (limpio === "") return "vacio";
  if (!/^\d+(\.\d+)?$/.test(limpio)) return "invalido";
  const n = Number(limpio);
  return Number.isFinite(n) && n <= MAX_CANTIDAD ? n : "invalido";
}

export type LineaParaResumen = { unidadMedida: string; esperado: number; contado: number | null; costoUnidad: number };

export type ResumenArqueo = {
  contados: number;
  sinContar: number;
  verdes: number;
  amarillos: number;
  rojos: number;
  // Valor (a costo) de lo que falta y de lo que sobra frente al sistema.
  faltante: number;
  sobrante: number;
};

export function resumirLineas(lineas: LineaParaResumen[]): ResumenArqueo {
  const r: ResumenArqueo = { contados: 0, sinContar: 0, verdes: 0, amarillos: 0, rojos: 0, faltante: 0, sobrante: 0 };
  for (const l of lineas) {
    if (l.contado === null) {
      r.sinContar++;
      continue;
    }
    r.contados++;
    const s = semaforoDiferencia(l.esperado, l.contado, l.unidadMedida);
    if (s === "verde") r.verdes++;
    else if (s === "amarillo") r.amarillos++;
    else r.rojos++;
    const valor = (l.contado - l.esperado) * l.costoUnidad;
    if (valor < 0) r.faltante += -valor;
    else r.sobrante += valor;
  }
  r.faltante = Math.round(r.faltante);
  r.sobrante = Math.round(r.sobrante);
  return r;
}
