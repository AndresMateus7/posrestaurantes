"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

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
  const [origen] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [mesaQr, setMesaQr] = useState<Mesa | null>(null);

  const cargar = useCallback(() => {
    fetch("/api/mesas").then((r) => r.json()).then(setMesas);
    fetch("/api/restaurante").then((r) => r.json()).then(setRestaurante);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!origen || mesas.length === 0) return;
    let cancelado = false;
    Promise.all(
      mesas.map(async (m) => {
        const url = `${origen}/menu/${m.qrToken}`;
        const dataUrl = await QRCode.toDataURL(url, { width: 240, margin: 1 });
        return [m.id, dataUrl] as const;
      })
    ).then((pares) => {
      if (!cancelado) setQrs(Object.fromEntries(pares));
    });
    return () => {
      cancelado = true;
    };
  }, [mesas, origen]);

  async function toggleRotaQr() {
    if (!restaurante) return;
    const nuevo = !restaurante.rotaQr;
    await fetch("/api/restaurante", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rotaQr: nuevo }) });
    setRestaurante({ ...restaurante, rotaQr: nuevo });
    onCambio(`rota_qr = ${nuevo} (PATCH /api/restaurante)`);
  }

  function imprimirQr(mesa: Mesa) {
    const dataUrl = qrs[mesa.id];
    if (!dataUrl) return;
    const ventana = window.open("", "_blank", "width=420,height=560");
    if (!ventana) return;
    ventana.document.write(`
      <html>
        <head><title>QR Mesa ${mesa.numero}</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;">
          <h2>Mesa ${mesa.numero}</h2>
          <img src="${dataUrl}" width="300" height="300" />
          <p style="font-size:12px;color:#666;">${origen}/menu/${mesa.qrToken}</p>
        </body>
      </html>
    `);
    ventana.document.close();
    setTimeout(() => {
      ventana.focus();
      ventana.print();
    }, 300);
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
              <th className="px-4 py-3">QR</th>
              <th className="px-4 py-3">Enlace del menú</th>
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
                  {qrs[m.id] ? (
                    <button onClick={() => setMesaQr(m)} className="block">
                      <img src={qrs[m.id]} alt={`QR Mesa ${m.numero}`} className="w-12 h-12 rounded border border-gray-200" />
                    </button>
                  ) : (
                    <div className="w-12 h-12 rounded bg-gray-100 animate-pulse" />
                  )}
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

      {mesaQr && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMesaQr(null)} />
          <div className="absolute inset-0 m-auto w-full max-w-xs h-fit rounded-3xl bg-white p-6 text-center">
            <h3 className="text-lg font-semibold">Mesa {mesaQr.numero}</h3>
            {qrs[mesaQr.id] && <img src={qrs[mesaQr.id]} alt={`QR Mesa ${mesaQr.numero}`} className="w-56 h-56 mx-auto mt-4 rounded-xl border border-gray-200" />}
            <p className="text-xs opacity-50 mt-3 break-all">
              {origen}/menu/{mesaQr.qrToken}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-5">
              <a
                href={qrs[mesaQr.id]}
                download={`qr-mesa-${mesaQr.numero}.png`}
                className="border border-gray-300 rounded-xl py-2.5 text-sm font-semibold"
              >
                Descargar PNG
              </a>
              <button onClick={() => imprimirQr(mesaQr)} className="text-white rounded-xl py-2.5 text-sm font-semibold" style={{ background: "var(--color-primario)" }}>
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
