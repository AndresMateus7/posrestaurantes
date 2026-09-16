"use client";

import { useCallback, useEffect, useState } from "react";

type Mesa = { id: string; numero: string; estado: string; qrToken: string };
type Restaurante = { rotaQr: boolean; slug: string };

const ESTILO: Record<string, string> = {
  libre: "bg-gray-100 text-gray-600",
  ocupada: "bg-blue-100 text-blue-700",
  pedido_servido: "bg-green-100 text-green-700",
  cuenta_solicitada: "bg-amber-100 text-amber-800",
  reservada: "bg-purple-100 text-purple-700",
};

export function MesasTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [restaurante, setRestaurante] = useState<Restaurante | null>(null);
  const [origen, setOrigen] = useState("");

  const cargar = useCallback(() => {
    fetch("/api/mesas").then((r) => r.json()).then(setMesas);
    fetch("/api/restaurante").then((r) => r.json()).then(setRestaurante);
  }, []);

  useEffect(() => {
    cargar();
    setOrigen(window.location.origin);
  }, [cargar]);

  async function toggleRotaQr() {
    if (!restaurante) return;
    const nuevo = !restaurante.rotaQr;
    await fetch("/api/restaurante", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rotaQr: nuevo }) });
    setRestaurante({ ...restaurante, rotaQr: nuevo });
    onCambio(`rota_qr = ${nuevo} (PATCH /api/restaurante)`);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center justify-between">
        <div>
          <p className="font-medium">Rotar QR automáticamente</p>
          <p className="text-xs opacity-60 mt-0.5">Si está apagado, el mesero debe abrir cada mesa manualmente.</p>
        </div>
        <button
          onClick={toggleRotaQr}
          className="w-10 h-[22px] rounded-full relative transition"
          style={{ background: restaurante?.rotaQr ? "var(--color-primario)" : "#D1D5DB" }}
        >
          <span className="w-[18px] h-[18px] rounded-full bg-white absolute top-0.5 transition-transform" style={{ transform: restaurante?.rotaQr ? "translateX(20px)" : "translateX(2px)" }} />
        </button>
      </div>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase opacity-60">
            <tr>
              <th className="px-4 py-3">Mesa</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Enlace del menú (QR)</th>
            </tr>
          </thead>
          <tbody>
            {mesas.map((m) => (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">Mesa {m.numero}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${ESTILO[m.estado] ?? ""}`}>{m.estado.replace("_", " ")}</span>
                </td>
                <td className="px-4 py-3">
                  <a href={`/menu/${m.qrToken}`} target="_blank" className="text-xs text-blue-600 underline">
                    {origen}/menu/{m.qrToken}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
