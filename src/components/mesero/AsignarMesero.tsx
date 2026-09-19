"use client";

import { useEffect, useState } from "react";

export type MeseroOpcion = { id: string; nombre: string };

/**
 * "Mesero de la mesa" para caja/admin: pone, cambia o quita el mesero de una
 * mesa que ya esta abierta. El mesero elegido pasa a verla y manejarla como si
 * la hubiera abierto el (pedidos, cuenta, llamados). Usar con `key={mesaId}`
 * para que la seleccion se reinicie al cambiar de mesa.
 */
export function AsignarMesero({
  mesaId,
  meseroIdActual,
  onAsignado,
  onError,
}: {
  mesaId: string;
  meseroIdActual: string | null;
  onAsignado: (mesero: MeseroOpcion | null) => void;
  onError: (mensaje: string) => void;
}) {
  const [meseros, setMeseros] = useState<MeseroOpcion[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Si el mesero de la mesa cambia (esta u otra pantalla), la seleccion pendiente ya no aplica.
  const [meseroPrevio, setMeseroPrevio] = useState(meseroIdActual);
  if (meseroPrevio !== meseroIdActual) {
    setMeseroPrevio(meseroIdActual);
    setSeleccion(null);
  }

  useEffect(() => {
    fetch("/api/meseros")
      .then((r) => r.json())
      .then((lista: unknown) => {
        if (Array.isArray(lista)) setMeseros(lista as MeseroOpcion[]);
      });
  }, []);

  const valor = seleccion ?? meseroIdActual ?? "";

  async function asignar() {
    setGuardando(true);
    try {
      const res = await fetch(`/api/mesas/${mesaId}/asignar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meseroId: valor || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError(data.error ?? "No se pudo asignar el mesero");
        return;
      }
      onAsignado(meseros.find((m) => m.id === valor) ?? null);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-xs font-semibold uppercase opacity-60 mb-2">Mesero de la mesa</p>
      <div className="flex gap-2">
        <select value={valor} onChange={(e) => setSeleccion(e.target.value)} className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
          <option value="">Sin mesero</option>
          {meseros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <button
          onClick={asignar}
          disabled={guardando || valor === (meseroIdActual ?? "")}
          className="text-white text-xs font-semibold rounded-lg px-4 disabled:opacity-40"
          style={{ background: "var(--color-primario)" }}
        >
          Asignar
        </button>
      </div>
      <p className="text-[11px] opacity-50 mt-1.5">El mesero elegido ve y maneja la mesa como si la hubiera abierto él; los demás meseros dejan de verla.</p>
    </div>
  );
}
