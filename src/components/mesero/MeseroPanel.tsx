"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEventos } from "@/lib/useEventos";
import { useRefrescoPeriodico } from "@/lib/useRefrescoPeriodico";
import { reproducirBeep } from "@/lib/beep";
import { PedidoMesero } from "./PedidoMesero";
import { LlamadosLista, type LlamadoPendiente } from "./LlamadosLista";
import { AsignarMesero } from "./AsignarMesero";

type Mesa = {
  id: string;
  elementoId: string;
  numero: string;
  capacidad: number;
  estado: string;
  meseroId: string | null;
  mesero: { nombre: string } | null;
};
type ItemCuenta = { id: string; nombreProducto: string; cantidad: number; estado: string; pedidoId: string; pedidoCreadoEn: string; adicionales: string[] };
type GrupoPedido = { pedidoId: string; creadoEn: string; items: ItemCuenta[] };
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
const CLASE_ITEM: Record<string, string> = {
  pendiente: "bg-gray-100 text-gray-500",
  en_preparacion: "bg-amber-100 text-amber-700",
  listo: "bg-green-100 text-green-700",
  entregado: "bg-blue-50 text-blue-700",
};
const formatoCOP = (v: number) => "$" + v.toLocaleString("es-CO");
const formatoHora = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });

// Los platos llegan en orden de creacion: cada pedido queda como un grupo, en orden.
function agruparPorPedido(items: ItemCuenta[]): GrupoPedido[] {
  const grupos: GrupoPedido[] = [];
  for (const it of items) {
    let grupo = grupos.find((g) => g.pedidoId === it.pedidoId);
    if (!grupo) {
      grupo = { pedidoId: it.pedidoId, creadoEn: it.pedidoCreadoEn, items: [] };
      grupos.push(grupo);
    }
    grupo.items.push(it);
  }
  return grupos;
}

const estaAbierta = (m: Mesa) => m.estado !== "libre" && m.estado !== "reservada";
// Un mesero no ve el detalle de las mesas que atiende otro mesero; caja y admin ven todo.
const atiendeOtro = (m: Mesa, usuarioId: string, rol: string) => rol === "mesero" && estaAbierta(m) && m.meseroId !== null && m.meseroId !== usuarioId;

// `embebido`: el mismo panel dentro de Caja/Admin (sin pagina propia ni cabecera),
// para que caja pueda hacer todo lo del mesero -- abrir mesas, tomar pedidos,
// atender llamados -- y ver quien atiende cada mesa sin salir de su pantalla.
export function MeseroPanel({
  restauranteNombre = "",
  rotaQr,
  usuarioId,
  rol,
  embebido = false,
}: {
  restauranteNombre?: string;
  rotaQr?: boolean;
  usuarioId: string;
  rol: string;
  embebido?: boolean;
}) {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [layout, setLayout] = useState<ElementoPlano[]>([]);
  const [llamados, setLlamados] = useState<LlamadoPendiente[]>([]);
  const [nuevosIds, setNuevosIds] = useState<Set<string>>(new Set());
  const [mesaAbiertaId, setMesaAbiertaId] = useState<string | null>(null);
  const [pedidoMesa, setPedidoMesa] = useState<Mesa | null>(null);
  const [cuenta, setCuenta] = useState<{ total: number; items: ItemCuenta[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Mesa cuya cuenta acabo de cerrar yo: su aviso "Piden la cuenta" es para Caja, no para mi.
  const cierrePropioRef = useRef<string | null>(null);

  const esMesero = rol === "mesero";
  const mesaAbierta = mesas.find((m) => m.id === mesaAbiertaId) ?? null;

  // Las respuestas de error (sesion vencida, mesa de otro mesero...) se ignoran: no deben tumbar la pantalla.
  const cargarMesas = useCallback(
    () =>
      fetch("/api/plano")
        .then((r) => r.json())
        .then((data) => {
          if (!data?.plano) return;
          setLayout(data.plano.layout);
          setMesas(data.mesas);
        }),
    []
  );
  const cargarLlamados = useCallback(
    () =>
      fetch("/api/llamados")
        .then((r) => r.json())
        .then((lista: unknown) => {
          if (Array.isArray(lista)) setLlamados(lista as LlamadoPendiente[]);
        }),
    []
  );
  const cargarCuenta = useCallback(
    (mesaId: string) =>
      fetch(`/api/mesas/${mesaId}/cuenta`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data?.items)) setCuenta(data);
        }),
    []
  );

  useEffect(() => {
    cargarMesas();
    cargarLlamados();
  }, [cargarMesas, cargarLlamados]);

  // Red de seguridad del canal en vivo: mesas y llamados se refrescan solos.
  useRefrescoPeriodico(() => {
    cargarMesas();
    cargarLlamados();
  });

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  useEventos({
    "llamado-creado": (payload) => {
      const l = payload as LlamadoPendiente & { mesaId?: string };
      setLlamados((prev) => (prev.some((x) => x.id === l.id) ? prev : [l, ...prev]));
      if (l.tipo === "solicitar_cuenta" && l.mesaId === cierrePropioRef.current) return;
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
    "mesa-actualizada": (payload) => {
      cargarMesas();
      cargarLlamados();
      // Caja/admin le asignaron esta mesa a este mesero (solo ese evento trae meseroId).
      const p = payload as { numero?: string; meseroId?: string | null };
      if (p.meseroId && p.meseroId === usuarioId) {
        reproducirBeep();
        mostrarToast(`📌 Te asignaron la Mesa ${p.numero}`);
      }
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

  // Entrega UN plato a la mesa (el mesero elige cual). La ventana sigue abierta
  // para poder seguir entregando; se refresca sola al recargar las mesas.
  async function entregarPlato(mesa: Mesa, plato: ItemCuenta) {
    const ok = await accion(`/api/pedidos/${plato.pedidoId}/entregar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: [plato.id] }),
    });
    if (!ok) return;
    await cargarMesas();
    mostrarToast(`${plato.nombreProducto} entregado a la Mesa ${mesa.numero} ✅`);
  }

  // Entrega todo lo que ya esta listo de un pedido (lo que sigue en cocina queda pendiente).
  async function entregarPedido(mesa: Mesa, grupo: GrupoPedido) {
    if (!(await accion(`/api/pedidos/${grupo.pedidoId}/entregar`, { method: "POST" }))) return;
    await cargarMesas();
    mostrarToast(`Pedido entregado a la Mesa ${mesa.numero} ✅`);
  }

  // "Cerrar cuenta": la cuenta queda cerrada con su valor y pasa a Caja para cobrarla.
  async function cerrarCuenta(mesa: Mesa) {
    const total = cuenta?.total ?? 0;
    cierrePropioRef.current = mesa.id;
    const ok = await accion(`/api/mesas/${mesa.id}/solicitar-cuenta`, { method: "POST" });
    // El aviso en vivo llega junto con la respuesta: se deja un margen y luego vuelve a avisar normal.
    setTimeout(() => {
      if (cierrePropioRef.current === mesa.id) cierrePropioRef.current = null;
    }, 5000);
    if (!ok) {
      cierrePropioRef.current = null;
      return;
    }
    await cargarMesas();
    setMesaAbiertaId(null);
    mostrarToast(`Cuenta de Mesa ${mesa.numero} cerrada: ${formatoCOP(total)} — pasó a Caja para cobrar`);
  }

  // Mesa que se abrio pero no consumio nada.
  async function liberarMesa(mesa: Mesa) {
    if (!(await accion(`/api/mesas/${mesa.id}/liberar`, { method: "POST" }))) return;
    await Promise.all([cargarMesas(), cargarLlamados()]);
    setMesaAbiertaId(null);
    mostrarToast(`Mesa ${mesa.numero} liberada`);
  }

  async function meseroAsignado(mesa: Mesa, mesero: { nombre: string } | null) {
    await Promise.all([cargarMesas(), cargarLlamados()]);
    mostrarToast(mesero ? `Mesa ${mesa.numero} asignada a ${mesero.nombre}` : `Mesa ${mesa.numero} quedó sin mesero`);
  }

  function etiquetaMesero(mesa: Mesa) {
    if (!estaAbierta(mesa)) return "";
    if (mesa.meseroId === null) return "Sin mesero";
    if (mesa.meseroId === usuarioId) return "Mía";
    return mesa.mesero?.nombre.split(" ")[0] ?? "Otro";
  }

  const Contenedor = embebido ? "div" : "main";

  return (
    <div className={embebido ? undefined : "min-h-screen pb-10"} style={embebido ? undefined : { background: "var(--color-fondo)", fontFamily: "var(--fuente)" }}>
      {!embebido && (
        <header className="sticky top-0 z-20 shadow-sm bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full grid place-items-center text-white font-bold shrink-0" style={{ background: "var(--color-secundario)" }}>
              {restauranteNombre.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="font-semibold leading-tight">Panel de Mesero</h1>
              <p className="text-xs opacity-60">{restauranteNombre}</p>
            </div>
            {rotaQr !== undefined && (
              <span className="ml-auto text-xs bg-black/5 rounded-full px-3 py-1">
                rota_qr: <b>{String(rotaQr)}</b>
              </span>
            )}
          </div>
        </header>
      )}

      <Contenedor className={embebido ? "space-y-6" : "max-w-5xl mx-auto px-4 py-5 space-y-6"}>
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-2">Llamados pendientes</h2>
          <LlamadosLista llamados={llamados} nuevosIds={nuevosIds} mostrarMesero={!esMesero} onAtender={atenderLlamado} />
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
      </Contenedor>

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
                <div className="space-y-3 mt-4">
                  {agruparPorPedido(cuenta?.items ?? []).map((grupo, i) => {
                    const listos = grupo.items.filter((it) => it.estado === "listo");
                    return (
                      <div key={grupo.pedidoId} className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-1.5">
                          <span className="text-xs font-semibold opacity-60">
                            Pedido {i + 1} · {formatoHora(grupo.creadoEn)}
                          </span>
                          {listos.length >= 2 && (
                            <button
                              onClick={() => entregarPedido(mesaAbierta, grupo)}
                              className="text-[11px] font-semibold text-white rounded-full px-2.5 py-1"
                              style={{ background: "var(--color-primario)" }}
                            >
                              {listos.length === grupo.items.length ? "Entregar pedido completo" : `Entregar lo que está listo (${listos.length})`}
                            </button>
                          )}
                        </div>
                        <div className="px-3">
                          {grupo.items.map((it) => (
                            <div key={it.id} className="flex items-center justify-between gap-2 text-sm border-b border-gray-100 last:border-b-0 py-2">
                              <span className={it.estado === "entregado" ? "opacity-50" : ""}>
                                {it.nombreProducto} <span className="opacity-50">× {it.cantidad}</span>
                                {it.adicionales.length > 0 && <span className="block text-xs opacity-50">+ {it.adicionales.join(", +")}</span>}
                              </span>
                              <span className="flex items-center gap-1.5 shrink-0">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${CLASE_ITEM[it.estado] ?? CLASE_ITEM.pendiente}`}>{ETIQUETA_ITEM[it.estado] ?? it.estado}</span>
                                {it.estado === "listo" && (
                                  <button
                                    onClick={() => entregarPlato(mesaAbierta, it)}
                                    className="text-xs font-semibold text-white rounded-full px-3 py-1"
                                    style={{ background: "var(--color-primario)" }}
                                  >
                                    Entregar
                                  </button>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {cuenta?.items.length === 0 && <p className="text-sm opacity-50">Todavía no hay pedidos en esta mesa.</p>}
                </div>
                <div className="flex justify-between font-bold mt-4">
                  <span>Total de la cuenta</span>
                  <span>{formatoCOP(cuenta?.total ?? 0)}</span>
                </div>
                {mesaAbierta.estado === "cuenta_solicitada" && (
                  <div className="mt-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-3 py-2 text-sm">
                    🧾 Cuenta cerrada — pendiente de cobro en Caja: <b>{formatoCOP(cuenta?.total ?? 0)}</b>
                  </div>
                )}
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
                {cuenta !== null && cuenta.total === 0 && (
                  <button onClick={() => liberarMesa(mesaAbierta)} className="w-full border border-gray-300 rounded-xl py-2.5 text-sm font-semibold mt-2">
                    Liberar mesa (sin consumo)
                  </button>
                )}
                {cuenta !== null && cuenta.total > 0 && mesaAbierta.estado !== "cuenta_solicitada" && (
                  <button
                    onClick={() => cerrarCuenta(mesaAbierta)}
                    className="w-full border-2 rounded-xl py-2.5 text-sm font-semibold mt-2"
                    style={{ borderColor: "var(--color-primario)", color: "var(--color-primario)" }}
                  >
                    Cerrar cuenta · {formatoCOP(cuenta.total)}
                  </button>
                )}
                {!esMesero && (
                  <div className="mt-4">
                    <AsignarMesero
                      key={mesaAbierta.id}
                      mesaId={mesaAbierta.id}
                      meseroIdActual={mesaAbierta.meseroId}
                      onAsignado={(mesero) => meseroAsignado(mesaAbierta, mesero)}
                      onError={mostrarToast}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {pedidoMesa && (
        <PedidoMesero
          titulo={`Tomar pedido — Mesa ${pedidoMesa.numero}`}
          tituloCarrito={`Pedido — Mesa ${pedidoMesa.numero}`}
          onCerrar={() => setPedidoMesa(null)}
          onEnviar={async (items) => {
            const res = await fetch("/api/pedidos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mesaId: pedidoMesa.id, items }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return { error: data.error ?? "No se pudo enviar el pedido", codigo: data.codigo };
            return { mensaje: `Pedido enviado a cocina — Mesa ${pedidoMesa.numero} 👨‍🍳` };
          }}
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
