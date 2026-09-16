"use client";

import { useCallback, useEffect, useState } from "react";

type Ingrediente = { id: string; nombre: string; unidadMedida: string; stockActual: string; stockMinimo: string };

function estadoStock(ing: Ingrediente) {
  const stock = Number(ing.stockActual);
  const min = Number(ing.stockMinimo);
  if (stock <= 0) return { label: "Agotado", clase: "bg-red-100 text-red-800" };
  if (stock < min) return { label: "Bajo", clase: "bg-amber-100 text-amber-800" };
  return { label: "OK", clase: "bg-green-100 text-green-800" };
}

export function InventarioTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);

  const cargar = useCallback(() => fetch("/api/ingredientes").then((r) => r.json()).then(setIngredientes), []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ajustar(ing: Ingrediente, delta: number) {
    await fetch(`/api/ingredientes/${ing.id}/movimientos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: delta > 0 ? "entrada" : "salida", cantidad: Math.abs(delta), motivo: "Ajuste manual desde panel" }),
    });
    cargar();
  }

  async function reabastecer(ing: Ingrediente) {
    const cantidad = Number(ing.stockMinimo) * 2 - Number(ing.stockActual);
    await fetch(`/api/ingredientes/${ing.id}/movimientos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "entrada", cantidad: Math.max(cantidad, 1), motivo: "Reabastecimiento" }),
    });
    cargar();
    onCambio(`${ing.nombre} reabastecido 📦`);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase opacity-60">
          <tr>
            <th className="px-4 py-3">Ingrediente</th>
            <th className="px-4 py-3">Stock</th>
            <th className="px-4 py-3">Mínimo</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Ajustar</th>
          </tr>
        </thead>
        <tbody>
          {ingredientes.map((ing) => {
            const e = estadoStock(ing);
            const paso = ing.unidadMedida === "unidad" ? 1 : 50;
            return (
              <tr key={ing.id} className="border-t border-gray-100">
                <td className="px-4 py-3">{ing.nombre}</td>
                <td className="px-4 py-3">{ing.stockActual} {ing.unidadMedida}</td>
                <td className="px-4 py-3 opacity-60">{ing.stockMinimo} {ing.unidadMedida}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${e.clase}`}>{e.label}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => ajustar(ing, -paso)} className="w-7 h-7 rounded-full border border-gray-300">−</button>
                    <button onClick={() => ajustar(ing, paso)} className="w-7 h-7 rounded-full border border-gray-300">+</button>
                    <button onClick={() => reabastecer(ing)} className="text-xs border border-gray-300 rounded-full px-2 py-1 ml-1">Reabastecer</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
