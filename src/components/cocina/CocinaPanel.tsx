"use client";

import { useCallback, useEffect, useState } from "react";
import { useEventos } from "@/lib/useEventos";

type ItemKds = {
  id: string;
  mesaNumero: string | null;
  // "Mesa 5", "Domicilio #12 · Juan" o "Para llevar #7 · Ana".
  destino: string;
  nombreProducto: string;
  cantidad: number;
  estacion: "bar" | "parrilla" | "cocina_general";
  estado: "pendiente" | "en_preparacion";
  creadoEn: string;
  tiempoPrepMin: number;
  ingredientesRemovidos: string[];
  adicionales: string[];
};

const ESTACIONES = [
  { id: "todas", nombre: "Todas" },
  { id: "bar", nombre: "Bar" },
  { id: "parrilla", nombre: "Parrilla" },
  { id: "cocina_general", nombre: "Cocina general" },
] as const;

function semaforo(item: ItemKds, ahora: number) {
  const elapsedMs = ahora - new Date(item.creadoEn).getTime();
  const ratio = elapsedMs / (item.tiempoPrepMin * 60000);
  if (ratio < 0.7) return { color: "border-green-500", texto: "text-green-400" };
  if (ratio < 1) return { color: "border-amber-500", texto: "text-amber-400" };
  return { color: "border-red-500", texto: "text-red-400" };
}

function formatoTiempo(ms: number) {
  const totalSeg = Math.max(0, Math.floor(ms / 1000));
  const min = String(Math.floor(totalSeg / 60)).padStart(2, "0");
  const seg = String(totalSeg % 60).padStart(2, "0");
  return `${min}:${seg}`;
}

export function CocinaPanel() {
  const [items, setItems] = useState<ItemKds[]>([]);
  const [estacionActiva, setEstacionActiva] = useState<(typeof ESTACIONES)[number]["id"]>("todas");
  const [ahora, setAhora] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState<Set<string>>(new Set());

  const cargar = useCallback(() => fetch("/api/items-pedido").then((r) => r.json()).then(setItems), []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
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
      // sin audio disponible
    }
  }

  useEventos({
    "pedido-creado": (payload) => {
      const p = payload as { mesaNumero: string | null; destino?: string; items: { nombreProducto: string }[] };
      cargar();
      reproducirBeep();
      mostrarToast(`🆕 Nuevo pedido — ${p.destino ?? `Mesa ${p.mesaNumero}`}: ${p.items.map((i) => i.nombreProducto).join(", ")}`);
    },
    "item-actualizado": () => cargar(),
  });

  async function avanzar(item: ItemKds) {
    const siguiente = item.estado === "pendiente" ? "en_preparacion" : "listo";
    await fetch(`/api/items-pedido/${item.id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: siguiente }),
    });
    if (siguiente === "listo") {
      setSaliendo((prev) => new Set(prev).add(item.id));
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setSaliendo((prev) => { const s = new Set(prev); s.delete(item.id); return s; });
      }, 220);
    } else {
      cargar();
    }
  }

  const visibles = items
    .filter((it) => estacionActiva === "todas" || it.estacion === estacionActiva)
    .sort((a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime());

  return (
    <div className="min-h-screen pb-10 bg-gray-900 text-gray-100">
      <header className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <h1 className="font-bold text-lg">🍳 KDS — Cocina</h1>
          <nav className="flex gap-2 ml-auto">
            {ESTACIONES.map((e) => {
              const n = items.filter((it) => e.id === "todas" || it.estacion === e.id).length;
              return (
                <button
                  key={e.id}
                  onClick={() => setEstacionActiva(e.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border border-white/20 ${estacionActiva === e.id ? "bg-gray-100 text-gray-900" : ""}`}
                >
                  {e.nombre} {n > 0 && <span className="opacity-60">({n})</span>}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibles.map((it) => {
            const s = semaforo(it, ahora);
            return (
              <article
                key={it.id}
                className={`bg-gray-800 border-2 ${s.color} rounded-2xl p-4 transition-opacity ${saliendo.has(it.id) ? "opacity-0" : "opacity-100"}`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold bg-white/10 rounded-full px-2 py-0.5 uppercase">{it.destino ?? `Mesa ${it.mesaNumero}`}</span>
                  <span className={`font-mono text-sm font-bold ${s.texto}`}>{formatoTiempo(ahora - new Date(it.creadoEn).getTime())}</span>
                </div>
                <p className="font-semibold text-lg mt-2">
                  {it.nombreProducto} <span className="opacity-50">× {it.cantidad}</span>
                </p>
                {it.ingredientesRemovidos.length > 0 && <p className="text-sm text-red-300 mt-1">SIN {it.ingredientesRemovidos.join(", ")}</p>}
                {it.adicionales.length > 0 && <p className="text-sm text-emerald-300 mt-1">+ {it.adicionales.join(", +")}</p>}
                <button
                  onClick={() => avanzar(it)}
                  className={`w-full mt-4 rounded-xl py-2.5 font-semibold text-sm ${it.estado === "pendiente" ? "bg-white text-gray-900" : "bg-emerald-500 text-white"}`}
                >
                  {it.estado === "pendiente" ? "Iniciar preparación" : "Marcar listo"}
                </button>
              </article>
            );
          })}
        </div>
        {visibles.length === 0 && <p className="text-center opacity-40 py-16">No hay pedidos pendientes en esta estación. 🎉</p>}
      </main>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-white text-sm shadow-lg bg-red-600">{toast}</div>
      )}
    </div>
  );
}
