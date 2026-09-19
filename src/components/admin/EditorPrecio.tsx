"use client";

import { useState } from "react";
import { formatoCOP, margenPorPrecio, precioPorMargen } from "@/lib/precios";

/**
 * Fija el precio de venta de las dos formas, como en el sistema del micromercado: escribiendo el
 * % de margen (calcula el precio) o escribiendo el precio (calcula el %). El margen es la ganancia
 * sobre el precio de venta: precio = costo / (1 - margen). Usar con un `key` que incluya el precio
 * actual para que los campos se reinicien cuando se guarda.
 */
export function EditorPrecio({
  costo,
  precioActual,
  margenAnterior,
  onAplicar,
}: {
  /** Costo de una porcion; null = todavia no se conoce (solo se puede escribir el precio). */
  costo: number | null;
  precioActual: number;
  /** Margen que tenia antes de la ultima compra, para poder volver a el con un clic. */
  margenAnterior?: number | null;
  onAplicar: (precio: number) => Promise<boolean>;
}) {
  const margenInicial = costo !== null ? margenPorPrecio(costo, precioActual) : null;
  const [precio, setPrecio] = useState(String(precioActual));
  const [margen, setMargen] = useState(margenInicial === null ? "" : String(Math.round(margenInicial)));
  const [guardando, setGuardando] = useState(false);

  const precioNum = Number(precio);
  const valido = Number.isInteger(precioNum) && precioNum > 0;
  const hayCambio = valido && precioNum !== precioActual;
  const ganancia = costo !== null && valido ? precioNum - costo : null;

  function cambiarMargen(texto: string) {
    setMargen(texto);
    if (costo === null || texto.trim() === "") return;
    const calculado = precioPorMargen(costo, Number(texto));
    if (calculado !== null) setPrecio(String(calculado));
  }

  function cambiarPrecio(texto: string) {
    setPrecio(texto);
    if (costo === null) return;
    const m = margenPorPrecio(costo, Number(texto));
    setMargen(m === null ? "" : String(Math.round(m)));
  }

  async function aplicar() {
    setGuardando(true);
    try {
      await onAplicar(precioNum);
    } finally {
      setGuardando(false);
    }
  }

  const margenActualNum = margen.trim() === "" ? null : Number(margen);
  const puedeVolver = costo !== null && margenAnterior != null && margenActualNum !== Math.round(margenAnterior);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {costo !== null && (
          <label className="flex items-center gap-1 text-xs">
            <input
              type="number"
              step={1}
              value={margen}
              onChange={(e) => cambiarMargen(e.target.value)}
              aria-label="Margen de ganancia en porcentaje"
              className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
            />
            <span className="opacity-60">% margen</span>
          </label>
        )}
        <label className="flex items-center gap-1 text-xs">
          <span className="opacity-60">Precio $</span>
          <input
            type="number"
            min={0}
            step={100}
            value={precio}
            onChange={(e) => cambiarPrecio(e.target.value)}
            aria-label="Precio de venta"
            className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
          />
        </label>
        <button onClick={aplicar} disabled={!hayCambio || guardando} className="text-xs font-semibold text-white rounded-lg px-3 py-1.5 bg-gray-900 disabled:opacity-30">
          Aplicar
        </button>
      </div>
      {ganancia !== null && (
        <p className={`text-[11px] mt-1 ${ganancia < 0 ? "text-red-600 font-semibold" : "opacity-60"}`}>
          {ganancia < 0 ? `Pierdes ${formatoCOP(-ganancia)} por venta` : `Ganas ${formatoCOP(ganancia)} por venta`}
        </p>
      )}
      {puedeVolver && (
        <button onClick={() => cambiarMargen(String(Math.round(margenAnterior!)))} className="text-[11px] underline opacity-70 mt-0.5">
          Volver al margen de antes ({Math.round(margenAnterior!)}%)
        </button>
      )}
    </div>
  );
}
