"use client";

import { useCallback, useEffect, useState } from "react";

type Ingrediente = {
  id: string;
  nombre: string;
  unidadMedida: string;
  stockActual: string;
  stockMinimo: string;
  costoPromedio: number;
  ubicacion: string | null;
  creadoEn: string;
  ultimaEntrada: string | null;
};

function estadoStock(ing: Ingrediente) {
  const stock = Number(ing.stockActual);
  const min = Number(ing.stockMinimo);
  if (stock <= 0) return { label: "Agotado", clase: "bg-red-100 text-red-800" };
  if (stock < min) return { label: "Bajo", clase: "bg-amber-100 text-amber-800" };
  return { label: "OK", clase: "bg-green-100 text-green-800" };
}

const formatoFecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
const formatoCOP = (v: number) => "$" + Math.round(v).toLocaleString("es-CO");

export function InventarioTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);

  const cargar = useCallback(() => fetch("/api/ingredientes").then((r) => r.json()).then(setIngredientes), []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardarStock(ing: Ingrediente, valorTexto: string) {
    const nuevo = Number(valorTexto);
    const actual = Number(ing.stockActual);
    if (!Number.isFinite(nuevo) || nuevo < 0 || nuevo === actual) return;
    const delta = nuevo - actual;
    await fetch(`/api/ingredientes/${ing.id}/movimientos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: delta > 0 ? "entrada" : "salida", cantidad: Math.abs(delta), motivo: "Ajuste manual desde panel" }),
    });
    cargar();
    onCambio(`Stock de ${ing.nombre} actualizado`);
  }

  async function guardarUbicacion(ing: Ingrediente, valor: string) {
    const nueva = valor.trim() || null;
    if (nueva === ing.ubicacion) return;
    await fetch(`/api/ingredientes/${ing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ubicacion: nueva }),
    });
    cargar();
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <p className="text-xs opacity-50 px-4 pt-3">
        Haz clic sobre el stock para corregirlo a un número exacto. Para compras reales a proveedores (con costo registrado), usa la pestaña{" "}
        <b>Facturas de proveedor</b> — ahí también sube el stock. Ubicación es opcional.
      </p>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase opacity-60">
          <tr>
            <th className="px-4 py-3">Ingrediente</th>
            <th className="px-4 py-3">Stock</th>
            <th className="px-4 py-3">Mínimo</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Costo prom.</th>
            <th className="px-4 py-3">Ubicación</th>
            <th className="px-4 py-3">Ingresó</th>
          </tr>
        </thead>
        <tbody>
          {ingredientes.map((ing) => {
            const e = estadoStock(ing);
            const esRegistro = !ing.ultimaEntrada;
            return (
              <tr key={ing.id} className="border-t border-gray-100">
                <td className="px-4 py-3">{ing.nombre}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <input
                      key={ing.stockActual}
                      type="number"
                      step="0.01"
                      defaultValue={ing.stockActual}
                      onBlur={(ev) => guardarStock(ing, ev.target.value)}
                      className="w-24 border border-transparent hover:border-gray-300 focus:border-gray-400 rounded-lg px-2 py-1 text-sm outline-none"
                    />
                    <span className="opacity-60">{ing.unidadMedida}</span>
                  </div>
                </td>
                <td className="px-4 py-3 opacity-60">{ing.stockMinimo} {ing.unidadMedida}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${e.clase}`}>{e.label}</span>
                </td>
                <td className="px-4 py-3 opacity-70">{formatoCOP(ing.costoPromedio)}/{ing.unidadMedida}</td>
                <td className="px-4 py-3">
                  <input
                    key={ing.ubicacion ?? ""}
                    defaultValue={ing.ubicacion ?? ""}
                    onBlur={(ev) => guardarUbicacion(ing, ev.target.value)}
                    placeholder="Sin definir"
                    className="w-32 border border-transparent hover:border-gray-300 focus:border-gray-400 rounded-lg px-2 py-1 text-sm placeholder:opacity-40 outline-none"
                  />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">
                  {formatoFecha(ing.ultimaEntrada ?? ing.creadoEn)}
                  {esRegistro && <span className="block opacity-50">registro inicial</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
