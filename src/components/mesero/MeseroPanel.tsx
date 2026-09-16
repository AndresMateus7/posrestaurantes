"use client";

import { useCallback, useEffect, useState } from "react";
import { useEventos } from "@/lib/useEventos";

type Mesa = { id: string; numero: string; capacidad: number; estado: string };
type Llamado = { id: string; tipo: "llamar_mesero" | "solicitar_cuenta"; mesaNumero: string; creadoEn: string };
type ItemCuenta = { id: string; nombreProducto: string; cantidad: number; estado: string; pedidoId: string; adicionales: string[] };

const ESTILO_ESTADO: Record<string, { label: string; clase: string }> = {
  libre: { label: "Libre", clase: "bg-gray-100 border-gray-300 text-gray-600" },
  ocupada: { label: "Ocupada", clase: "bg-blue-50 border-blue-400 text-blue-700" },
  pedido_servido: { label: "Pedido servido", clase: "bg-green-50 border-green-400 text-green-700" },
  cuenta_solicitada: { label: "Pidió la cuenta", clase: "bg-amber-50 border-amber-400 text-amber-800" },
  reservada: { label: "Reservada", clase: "bg-purple-50 border-purple-400 text-purple-700" },
};
const ETIQUETA_ITEM: Record<string, string> = { pendiente: "Pendiente", en_preparacion: "En preparación", listo: "Listo", entregado: "Entregado" };
const formatoCOP = (v: number) => "$" + v.toLocaleString("es-CO");

export function MeseroPanel({ restauranteNombre, rotaQr }: { restauranteNombre: string; rotaQr: boolean }) {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [llamados, setLlamados] = useState<Llamado[]>([]);
  const [nuevosIds, setNuevosIds] = useState<Set<string>>(new Set());
  const [mesaAbierta, setMesaAbierta] = useState<Mesa | null>(null);
  const [cuenta, setCuenta] = useState<{ total: number; items: ItemCuenta[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const cargarMesas = useCallback(() => fetch("/api/mesas").then((r) => r.json()).then(setMesas), []);
  const cargarLlamados = useCallback(() => fetch("/api/llamados").then((r) => r.json()).then(setLlamados), []);
  const cargarCuenta = useCallback((mesaId: string) => fetch(`/api/mesas/${mesaId}/cuenta`).then((r) => r.json()).then(setCuenta), []);

  useEffect(() => {
    cargarMesas();
    cargarLlamados();
  }, [cargarMesas, cargarLlamados]);

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function reproducirBeep() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // sin audio disponible; no es critico
    }
  }

  useEventos({
    "llamado-creado": (payload) => {
      const l = payload as Llamado;
      setLlamados((prev) => [l, ...prev]);
      setNuevosIds((prev) => new Set(prev).add(l.id));
      setTimeout(() => setNuevosIds((prev) => { const s = new Set(prev); s.delete(l.id); return s; }), 3000);
      reproducirBeep();
      mostrarToast(`${l.tipo === "llamar_mesero" ? "🛎️ Llaman al mesero" : "🧾 Piden la cuenta"} — Mesa ${l.mesaNumero}`);
    },
    "mesa-actualizada": () => cargarMesas(),
    "pedido-creado": () => cargarMesas(),
    "item-actualizado": () => cargarMesas(),
    "pedido-entregado": () => cargarMesas(),
  });

  useEffect(() => {
    if (mesaAbierta && mesaAbierta.estado !== "libre" && mesaAbierta.estado !== "reservada") {
      cargarCuenta(mesaAbierta.id);
    }
  }, [mesaAbierta, cargarCuenta]);

  async function atenderLlamado(id: string) {
    await fetch(`/api/llamados/${id}`, { method: "PATCH" });
    setLlamados((prev) => prev.filter((l) => l.id !== id));
    mostrarToast("Llamado atendido ✅");
  }

  async function abrirMesa(mesa: Mesa) {
    await fetch(`/api/mesas/${mesa.id}/abrir`, { method: "POST" });
    await cargarMesas();
    setMesaAbierta(null);
    mostrarToast(`Mesa ${mesa.numero} abierta 🔓`);
  }

  async function marcarEntregado(mesa: Mesa) {
    if (!cuenta) return;
    const pedidosListos = new Set(cuenta.items.filter((it) => it.estado === "listo").map((it) => it.pedidoId));
    await Promise.all([...pedidosListos].map((pedidoId) => fetch(`/api/pedidos/${pedidoId}/entregar`, { method: "POST" })));
    await cargarMesas();
    setMesaAbierta(null);
    mostrarToast(`Pedido de Mesa ${mesa.numero} marcado entregado`);
  }

  async function solicitarCuenta(mesa: Mesa) {
    await fetch(`/api/mesas/${mesa.id}/solicitar-cuenta`, { method: "POST" });
    await cargarMesas();
    setMesaAbierta(null);
    mostrarToast(`Cuenta solicitada para Mesa ${mesa.numero}`);
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: "var(--color-fondo)", fontFamily: "var(--fuente)" }}>
      <header className="sticky top-0 z-20 shadow-sm bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full grid place-items-center text-white font-bold shrink-0" style={{ background: "var(--color-secundario)" }}>
            {restauranteNombre.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="font-semibold leading-tight">Panel de Mesero</h1>
            <p className="text-xs opacity-60">{restauranteNombre}</p>
          </div>
          <span className="ml-auto text-xs bg-black/5 rounded-full px-3 py-1">
            rota_qr: <b>{String(rotaQr)}</b>
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-6">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-2">Llamados pendientes</h2>
          <div className="space-y-2">
            {llamados.map((l) => (
              <div
                key={l.id}
                className={`flex items-center gap-3 bg-white rounded-xl border border-amber-200 px-4 py-2.5 shadow-sm ${nuevosIds.has(l.id) ? "animate-pulse" : ""}`}
              >
                <span className="text-xl">{l.tipo === "llamar_mesero" ? "🛎️" : "🧾"}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {l.tipo === "llamar_mesero" ? "Llaman al mesero" : "Piden la cuenta"} — Mesa {l.mesaNumero}
                  </p>
                </div>
                <button onClick={() => atenderLlamado(l.id)} className="text-white text-xs font-semibold rounded-full px-3 py-1.5" style={{ background: "var(--color-primario)" }}>
                  Atender
                </button>
              </div>
            ))}
            {llamados.length === 0 && <p className="text-sm opacity-50">No hay llamados pendientes. 👍</p>}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-2">Mapa de mesas</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {mesas.map((m) => {
              const estilo = ESTILO_ESTADO[m.estado] ?? ESTILO_ESTADO.libre;
              return (
                <button
                  key={m.id}
                  onClick={() => setMesaAbierta(m)}
                  className={`rounded-2xl border-2 p-4 text-left transition hover:brightness-95 ${estilo.clase}`}
                >
                  <p className="text-2xl font-bold">{m.numero}</p>
                  <p className="text-xs font-medium mt-1">{estilo.label}</p>
                  <p className="text-[11px] opacity-60 mt-0.5">{m.capacidad} puestos</p>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      {mesaAbierta && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMesaAbierta(null)} />
          <div className="absolute bottom-0 left-0 right-0 sm:m-auto sm:relative sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
            {mesaAbierta.estado === "libre" || mesaAbierta.estado === "reservada" ? (
              <>
                <h3 className="text-lg font-semibold">Mesa {mesaAbierta.numero}</h3>
                <p className="text-sm opacity-60 mt-1">{mesaAbierta.capacidad} puestos · {ESTILO_ESTADO[mesaAbierta.estado].label}</p>
                <button onClick={() => abrirMesa(mesaAbierta)} className="w-full text-white rounded-xl py-3 font-semibold mt-4" style={{ background: "var(--color-primario)" }}>
                  Abrir mesa {mesaAbierta.numero}
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold">Mesa {mesaAbierta.numero}</h3>
                <p className="text-sm opacity-60 mt-1">{ESTILO_ESTADO[mesaAbierta.estado].label}</p>
                <div className="space-y-2 mt-4">
                  {cuenta?.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
                      <span>
                        {it.nombreProducto} <span className="opacity-50">× {it.cantidad}</span>
                        {it.adicionales.length > 0 && <span className="block text-xs opacity-50">+ {it.adicionales.join(", +")}</span>}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${it.estado === "listo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {ETIQUETA_ITEM[it.estado]}
                      </span>
                    </div>
                  ))}
                  {cuenta?.items.length === 0 && <p className="text-sm opacity-50">Sin items activos.</p>}
                </div>
                <div className="flex justify-between font-bold mt-4">
                  <span>Total corriente</span>
                  <span>{formatoCOP(cuenta?.total ?? 0)}</span>
                </div>
                <div className={`grid ${mesaAbierta.estado === "cuenta_solicitada" ? "grid-cols-1" : "grid-cols-2"} gap-2 mt-4`}>
                  {cuenta?.items.some((it) => it.estado === "listo") && (
                    <button onClick={() => marcarEntregado(mesaAbierta)} className="text-white rounded-xl py-2.5 text-sm font-semibold" style={{ background: "var(--color-primario)" }}>
                      Marcar entregado
                    </button>
                  )}
                  {mesaAbierta.estado !== "cuenta_solicitada" ? (
                    <button onClick={() => solicitarCuenta(mesaAbierta)} className="border border-gray-300 rounded-xl py-2.5 text-sm font-semibold">
                      Solicitar cuenta
                    </button>
                  ) : (
                    <p className="text-xs text-center opacity-50 py-2">El cierre de pago lo hace Caja.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-white text-sm shadow-lg" style={{ background: "var(--color-secundario)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
