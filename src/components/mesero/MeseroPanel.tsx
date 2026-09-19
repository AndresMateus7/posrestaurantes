"use client";

import { useCallback, useEffect, useState } from "react";
import { useEventos } from "@/lib/useEventos";
import { PedidoMesero } from "./PedidoMesero";

type Mesa = {
  id: string;
  elementoId: string;
  numero: string;
  capacidad: number;
  estado: string;
  meseroId: string | null;
  mesero: { nombre: string } | null;
};
type Llamado = { id: string; tipo: "llamar_mesero" | "solicitar_cuenta"; mesaNumero: string; comentario: string | null; creadoEn: string };
type ItemCuenta = { id: string; nombreProducto: string; cantidad: number; estado: string; pedidoId: string; adicionales: string[] };
type TipoElemento = "mesa" | "barra" | "pared" | "caja" | "cocina" | "decoracion";
type ElementoPlano = { id: string; tipo: TipoElemento; forma?: "cuadrada" | "redonda" | "rectangular"; x: number; y: number; ancho: number; alto: number; rotacion: number };

const ICONO_ELEMENTO: Record<string, string> = { barra: "🍹 Barra", pared: "Pared", caja: "💳 Caja", cocina: "🍳 Cocina", decoracion: "Decoración" };

const ESTILO_ESTADO: Record<string, { label: string; clase: string }> = {
  libre: { label: "Libre", clase: "bg-gray-100 border-gray-300 text-gray-600" },
  ocupada: { label: "Ocupada", clase: "bg-blue-50 border-blue-400 text-blue-700" },
  pedido_servido: { label: "Pedido servido", clase: "bg-green-50 border-green-400 text-green-700" },
  cuenta_solicitada: { label: "Pidió la cuenta", clase: "bg-amber-50 border-amber-400 text-amber-800" },
  reservada: { label: "Reservada", clase: "bg-purple-50 border-purple-400 text-purple-700" },
};
const ETIQUETA_ITEM: Record<string, string> = { pendiente: "Pendiente", en_preparacion: "En preparación", listo: "Listo", entregado: "Entregado" };
const formatoCOP = (v: number) => "$" + v.toLocaleString("es-CO");

const estaAbierta = (m: Mesa) => m.estado !== "libre" && m.estado !== "reservada";
// Un mesero no ve el detalle de las mesas que atiende otro mesero; caja y admin ven todo.
const atiendeOtro = (m: Mesa, usuarioId: string, rol: string) => rol === "mesero" && estaAbierta(m) && m.meseroId !== null && m.meseroId !== usuarioId;

export function MeseroPanel({ restauranteNombre, rotaQr, usuarioId, rol }: { restauranteNombre: string; rotaQr: boolean; usuarioId: string; rol: string }) {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [layout, setLayout] = useState<ElementoPlano[]>([]);
  const [llamados, setLlamados] = useState<Llamado[]>([]);
  const [nuevosIds, setNuevosIds] = useState<Set<string>>(new Set());
  const [mesaAbiertaId, setMesaAbiertaId] = useState<string | null>(null);
  const [pedidoMesa, setPedidoMesa] = useState<Mesa | null>(null);
  const [cuenta, setCuenta] = useState<{ total: number; items: ItemCuenta[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const esMesero = rol === "mesero";
  const mesaAbierta = mesas.find((m) => m.id === mesaAbiertaId) ?? null;

  const cargarMesas = useCallback(
    () =>
      fetch("/api/plano")
        .then((r) => r.json())
        .then((data) => {
          setLayout(data.plano.layout);
          setMesas(data.mesas);
        }),
    []
  );
  const cargarLlamados = useCallback(() => fetch("/api/llamados").then((r) => r.json()).then(setLlamados), []);
  const cargarCuenta = useCallback((mesaId: string) => fetch(`/api/mesas/${mesaId}/cuenta`).then((r) => r.json()).then(setCuenta), []);

  useEffect(() => {
    cargarMesas();
    cargarLlamados();
  }, [cargarMesas, cargarLlamados]);

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
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
      setLlamados((prev) => (prev.some((x) => x.id === l.id) ? prev : [l, ...prev]));
      setNuevosIds((prev) => new Set(prev).add(l.id));
      setTimeout(() => setNuevosIds((prev) => { const s = new Set(prev); s.delete(l.id); return s; }), 3000);
      reproducirBeep();
      mostrarToast(`${l.tipo === "llamar_mesero" ? "🛎️ Llaman al mesero" : "🧾 Piden la cuenta"} — Mesa ${l.mesaNumero}`);
    },
    "llamado-atendido": (payload) => {
      const { id } = payload as { id: string };
      setLlamados((prev) => prev.filter((l) => l.id !== id));
    },
    // Cuando alguien toma una mesa, los llamados de esa mesa dejan de ser visibles para los demas meseros.
    "mesa-actualizada": () => {
      cargarMesas();
      cargarLlamados();
    },
    "pedido-creado": () => cargarMesas(),
    "item-actualizado": () => cargarMesas(),
    "pedido-entregado": () => cargarMesas(),
    "plano-actualizado": () => cargarMesas(),
  });

  useEffect(() => {
    if (mesaAbierta && estaAbierta(mesaAbierta) && !atiendeOtro(mesaAbierta, usuarioId, rol)) {
      cargarCuenta(mesaAbierta.id);
    }
  }, [mesaAbierta, usuarioId, rol, cargarCuenta]);

  function abrirModalMesa(mesa: Mesa) {
    setCuenta(null);
    setMesaAbiertaId(mesa.id);
  }

  // Ejecuta una accion contra la API; si falla (ej. la mesa la tomo otro mesero
  // mientras tanto) avisa y refresca el mapa en vez de dejar la pantalla desactualizada.
  async function accion(url: string, init?: RequestInit): Promise<boolean> {
    const res = await fetch(url, init);
    if (res.ok) return true;
    const data = await res.json().catch(() => ({}));
    mostrarToast(data.error ?? "No se pudo completar la acción");
    await Promise.all([cargarMesas(), cargarLlamados()]);
    return false;
  }

  async function atenderLlamado(id: string) {
    if (!(await accion(`/api/llamados/${id}`, { method: "PATCH" }))) return;
    setLlamados((prev) => prev.filter((l) => l.id !== id));
    mostrarToast("Llamado atendido ✅");
  }

  async function abrirMesa(mesa: Mesa, tomarPedido: boolean) {
    if (!(await accion(`/api/mesas/${mesa.id}/abrir`, { method: "POST" }))) return;
    await cargarMesas();
    setMesaAbiertaId(null);
    if (tomarPedido) setPedidoMesa(mesa);
    else mostrarToast(`Mesa ${mesa.numero} abierta 🔓`);
  }

  async function tomarMesa(mesa: Mesa) {
    if (!(await accion(`/api/mesas/${mesa.id}/abrir`, { method: "POST" }))) return;
    await Promise.all([cargarMesas(), cargarLlamados()]);
    mostrarToast(`Mesa ${mesa.numero} quedó a tu nombre`);
  }

  async function marcarEntregado(mesa: Mesa) {
    if (!cuenta) return;
    const pedidosListos = [...new Set(cuenta.items.filter((it) => it.estado === "listo").map((it) => it.pedidoId))];
    for (const pedidoId of pedidosListos) {
      if (!(await accion(`/api/pedidos/${pedidoId}/entregar`, { method: "POST" }))) return;
    }
    await cargarMesas();
    setMesaAbiertaId(null);
    mostrarToast(`Pedido de Mesa ${mesa.numero} marcado entregado`);
  }

  async function solicitarCuenta(mesa: Mesa) {
    if (!(await accion(`/api/mesas/${mesa.id}/solicitar-cuenta`, { method: "POST" }))) return;
    await cargarMesas();
    setMesaAbiertaId(null);
    mostrarToast(`Cuenta solicitada para Mesa ${mesa.numero}`);
  }

  function etiquetaMesero(mesa: Mesa) {
    if (!estaAbierta(mesa)) return "";
    if (mesa.meseroId === null) return "Sin mesero";
    if (mesa.meseroId === usuarioId) return "Mía";
    return mesa.mesero?.nombre.split(" ")[0] ?? "Otro";
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {l.tipo === "llamar_mesero" ? "Llaman al mesero" : "Piden la cuenta"} — Mesa {l.mesaNumero}
                  </p>
                  {l.comentario && <p className="text-sm mt-0.5 opacity-80 break-words">&ldquo;{l.comentario}&rdquo;</p>}
                </div>
                <button onClick={() => atenderLlamado(l.id)} className="text-white text-xs font-semibold rounded-full px-3 py-1.5 shrink-0" style={{ background: "var(--color-primario)" }}>
                  Atender
                </button>
              </div>
            ))}
            {llamados.length === 0 && <p className="text-sm opacity-50">No hay llamados pendientes. 👍</p>}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-2">Plano del local</h2>
          <div className="flex gap-3 text-[11px] flex-wrap mb-2">
            {Object.values(ESTILO_ESTADO).map((e) => (
              <span key={e.label} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${e.clase}`}>
                {e.label}
              </span>
            ))}
          </div>
          <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-gray-200">
            <div
              className="relative"
              style={{ height: 520, minWidth: 600, backgroundImage: "radial-gradient(#E5E7EB 1px, transparent 1px)", backgroundSize: "16px 16px" }}
            >
              {layout.map((f) => {
                if (f.tipo === "mesa") {
                  const mesa = mesas.find((m) => m.elementoId === f.id);
                  const estilo = ESTILO_ESTADO[mesa?.estado ?? "libre"] ?? ESTILO_ESTADO.libre;
                  const esMia = !!mesa && estaAbierta(mesa) && mesa.meseroId === usuarioId;
                  const deOtro = !!mesa && atiendeOtro(mesa, usuarioId, rol);
                  return (
                    <button
                      key={f.id}
                      onClick={() => mesa && abrirModalMesa(mesa)}
                      className={`absolute flex flex-col items-center justify-center border-2 rounded-lg ${estilo.clase} ${deOtro ? "opacity-50" : ""}`}
                      style={{
                        left: f.x,
                        top: f.y,
                        width: f.ancho,
                        height: f.alto,
                        borderRadius: f.forma === "redonda" ? 9999 : 10,
                        transform: `rotate(${f.rotacion ?? 0}deg)`,
                        boxShadow: esMia ? "0 0 0 3px var(--color-primario)" : undefined,
                      }}
                    >
                      <span className="font-bold text-lg leading-none">{mesa?.numero ?? "?"}</span>
                      <span className="text-[10px] opacity-70">{mesa ? `${mesa.capacidad}p` : ""}</span>
                      {mesa && estaAbierta(mesa) && <span className="text-[9px] font-semibold leading-none mt-0.5 max-w-full truncate px-1">{etiquetaMesero(mesa)}</span>}
                    </button>
                  );
                }
                return (
                  <div
                    key={f.id}
                    className="absolute flex items-center justify-center text-center text-xs font-medium border-2 border-dashed border-gray-400 bg-gray-50 text-gray-500 rounded-lg px-1"
                    style={{ left: f.x, top: f.y, width: f.ancho, height: f.alto, transform: `rotate(${f.rotacion ?? 0}deg)` }}
                  >
                    {ICONO_ELEMENTO[f.tipo] ?? f.tipo}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {mesaAbierta && (
        <div className="fixed inset-0 z-30">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMesaAbiertaId(null)} />
          <div className="absolute bottom-0 left-0 right-0 sm:m-auto sm:relative sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
            {!estaAbierta(mesaAbierta) ? (
              <>
                <h3 className="text-lg font-semibold">Mesa {mesaAbierta.numero}</h3>
                <p className="text-sm opacity-60 mt-1">
                  {mesaAbierta.capacidad} puestos · {ESTILO_ESTADO[mesaAbierta.estado].label}
                </p>
                <button onClick={() => abrirMesa(mesaAbierta, true)} className="w-full text-white rounded-xl py-3 font-semibold mt-4" style={{ background: "var(--color-primario)" }}>
                  Abrir mesa y tomar pedido
                </button>
                <button onClick={() => abrirMesa(mesaAbierta, false)} className="w-full border border-gray-300 rounded-xl py-3 text-sm font-semibold mt-2">
                  Solo abrir mesa {mesaAbierta.numero}
                </button>
              </>
            ) : atiendeOtro(mesaAbierta, usuarioId, rol) ? (
              <>
                <h3 className="text-lg font-semibold">Mesa {mesaAbierta.numero}</h3>
                <p className="text-sm opacity-60 mt-1">{ESTILO_ESTADO[mesaAbierta.estado].label}</p>
                <div className="mt-4 bg-gray-50 rounded-xl p-4 text-sm">
                  <p className="font-medium">🔒 La atiende {mesaAbierta.mesero?.nombre ?? "otro mesero"}</p>
                  <p className="opacity-60 mt-1">Solo el mesero asignado, caja y administración pueden ver o modificar los pedidos de esta mesa.</p>
                </div>
              </>
            ) : esMesero && mesaAbierta.meseroId === null ? (
              <>
                <h3 className="text-lg font-semibold">Mesa {mesaAbierta.numero}</h3>
                <p className="text-sm opacity-60 mt-1">{ESTILO_ESTADO[mesaAbierta.estado].label}</p>
                <div className="mt-4 bg-amber-50 rounded-xl p-4 text-sm text-amber-900">Ningún mesero atiende esta mesa todavía. Si la tomas, queda a tu nombre y nadie más podrá ver sus pedidos.</div>
                <button onClick={() => tomarMesa(mesaAbierta)} className="w-full text-white rounded-xl py-3 font-semibold mt-4" style={{ background: "var(--color-primario)" }}>
                  Tomar esta mesa
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold">Mesa {mesaAbierta.numero}</h3>
                <p className="text-sm opacity-60 mt-1">
                  {ESTILO_ESTADO[mesaAbierta.estado].label}
                  {!esMesero && ` · Atiende: ${mesaAbierta.mesero?.nombre ?? "sin mesero"}`}
                </p>
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
                <button
                  onClick={() => {
                    setPedidoMesa(mesaAbierta);
                    setMesaAbiertaId(null);
                  }}
                  className="w-full text-white rounded-xl py-3 font-semibold mt-4"
                  style={{ background: "var(--color-primario)" }}
                >
                  Tomar pedido
                </button>
                <div className={`grid ${mesaAbierta.estado === "cuenta_solicitada" || !cuenta?.items.some((it) => it.estado === "listo") ? "grid-cols-1" : "grid-cols-2"} gap-2 mt-2`}>
                  {cuenta?.items.some((it) => it.estado === "listo") && (
                    <button onClick={() => marcarEntregado(mesaAbierta)} className="border border-gray-300 rounded-xl py-2.5 text-sm font-semibold">
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

      {pedidoMesa && (
        <PedidoMesero
          mesa={{ id: pedidoMesa.id, numero: pedidoMesa.numero }}
          onCerrar={() => setPedidoMesa(null)}
          onEnviado={(mensaje) => {
            setPedidoMesa(null);
            mostrarToast(mensaje);
            cargarMesas();
          }}
        />
      )}

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-white text-sm shadow-lg" style={{ background: "var(--color-secundario)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
