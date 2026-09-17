"use client";

import { useCallback, useEffect, useState } from "react";
import { useEventos } from "@/lib/useEventos";

type TurnoResumen = {
  id: string;
  estado: "abierto" | "cerrado";
  montoInicial: number;
  abiertoEn: string;
  usuario: { nombre: string };
  movimientos: { id: string; tipo: string; monto: number; descripcion: string | null; creadoEn: string }[];
  totalPagos: number;
  pagosPorMetodo: Record<string, number>;
  montoSistemaActual: number | null;
};

type CuentaResumen = {
  id: string;
  mesaId: string;
  mesaNumero: string;
  estado: string;
  subtotal: number;
  propina: number;
  total: number;
  totalPagado: number;
  creadoEn: string;
};

type ItemDetalle = {
  id: string;
  pedidoId: string;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  estado: string;
  adicionales: { nombre: string; precioUnitario: number; cantidad: number }[];
};
type SubCuentaDetalle = {
  id: string;
  etiqueta: string;
  tipoDivision: string;
  monto: number;
  pagado: boolean;
  items: { id: string; itemPedidoId: string; cantidadAsignada: number }[];
};
type PagoDetalle = { id: string; metodo: string; monto: number; subCuentaId: string | null; creadoEn: string };
type CuentaDetalle = {
  id: string;
  mesaId: string;
  mesaNumero: string;
  estado: string;
  subtotal: number;
  propina: number;
  total: number;
  items: ItemDetalle[];
  subCuentas: SubCuentaDetalle[];
  pagos: PagoDetalle[];
  totalPagado: number;
};

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta_credito: "Tarjeta crédito",
  tarjeta_debito: "Tarjeta débito",
  nequi: "Nequi",
  daviplata: "Daviplata",
  transferencia: "Transferencia",
};
const formatoCOP = (v: number) => "$" + Math.round(v).toLocaleString("es-CO");

export function CajaPanel({ restauranteNombre }: { restauranteNombre: string }) {
  const [turno, setTurno] = useState<TurnoResumen | null | undefined>(undefined);
  const [montoInicialInput, setMontoInicialInput] = useState("");
  const [cuentas, setCuentas] = useState<CuentaResumen[]>([]);
  const [cuentaSeleccionadaId, setCuentaSeleccionadaId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<CuentaDetalle | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [mostrarDividir, setMostrarDividir] = useState(false);
  const [modoDividir, setModoDividir] = useState<"partes_iguales" | "por_items">("partes_iguales");
  const [numeroPartes, setNumeroPartes] = useState(2);
  const [nombresPersonas, setNombresPersonas] = useState<string[]>(["Persona 1", "Persona 2"]);
  const [asignaciones, setAsignaciones] = useState<Record<string, number[]>>({});

  const [mostrarPago, setMostrarPago] = useState(false);
  const [pagoSubCuentaId, setPagoSubCuentaId] = useState<string | null>(null);
  const [pagoMetodo, setPagoMetodo] = useState("efectivo");
  const [pagoMonto, setPagoMonto] = useState("");
  const [pagoReferencia, setPagoReferencia] = useState("");

  const [mostrarMovimiento, setMostrarMovimiento] = useState(false);
  const [movTipo, setMovTipo] = useState<"retiro" | "ingreso_manual">("retiro");
  const [movMonto, setMovMonto] = useState("");
  const [movDescripcion, setMovDescripcion] = useState("");

  const [mostrarCerrarTurno, setMostrarCerrarTurno] = useState(false);
  const [montoFinalInput, setMontoFinalInput] = useState("");

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  const cargarTurno = useCallback(() => fetch("/api/turnos").then((r) => r.json()).then(setTurno), []);
  const cargarCuentas = useCallback(() => fetch("/api/cuentas").then((r) => r.json()).then(setCuentas), []);
  const cargarDetalle = useCallback((id: string) => fetch(`/api/cuentas/${id}`).then((r) => r.json()).then(setDetalle), []);

  useEffect(() => {
    cargarTurno();
  }, [cargarTurno]);

  useEffect(() => {
    if (turno) cargarCuentas();
  }, [turno, cargarCuentas]);

  useEffect(() => {
    if (cuentaSeleccionadaId) cargarDetalle(cuentaSeleccionadaId);
  }, [cuentaSeleccionadaId, cargarDetalle]);

  function cerrarDetalle() {
    setCuentaSeleccionadaId(null);
    setDetalle(null);
  }

  useEventos({
    "cuenta-actualizada": (payload) => {
      cargarCuentas();
      cargarTurno();
      const p = payload as { cuentaId: string };
      if (cuentaSeleccionadaId === p.cuentaId) cargarDetalle(p.cuentaId);
    },
    "cuenta-cerrada": (payload) => {
      cargarCuentas();
      const p = payload as { cuentaId: string };
      if (cuentaSeleccionadaId === p.cuentaId) {
        cerrarDetalle();
        mostrarToast("Esa cuenta se cerró desde otra caja");
      }
    },
    "pedido-creado": () => cargarCuentas(),
  });

  async function confirmarAbrirTurno() {
    const monto = Number(montoInicialInput) || 0;
    const res = await fetch("/api/turnos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ montoInicial: monto }) });
    if (!res.ok) {
      const data = await res.json();
      mostrarToast(data.error ?? "No se pudo abrir el turno");
      cargarTurno();
      return;
    }
    setMontoInicialInput("");
    cargarTurno();
  }

  function abrirDetalleCuenta(id: string) {
    setCuentaSeleccionadaId(id);
  }

  function iniciarDividir() {
    if (!detalle) return;
    setModoDividir("partes_iguales");
    setNumeroPartes(2);
    setNombresPersonas(["Persona 1", "Persona 2"]);
    setAsignaciones(Object.fromEntries(detalle.items.map((it) => [it.id, [0, 0]])));
    setMostrarDividir(true);
  }

  function cambiarNumPersonas(delta: number) {
    setNombresPersonas((prev) => {
      const nuevo = Math.max(1, prev.length + delta);
      const copia = [...prev];
      while (copia.length < nuevo) copia.push(`Persona ${copia.length + 1}`);
      while (copia.length > nuevo) copia.pop();
      return copia;
    });
    setAsignaciones((prev) => {
      const copia: Record<string, number[]> = {};
      for (const [itemId, arr] of Object.entries(prev)) {
        const nuevaArr = [...arr];
        const nuevoLargo = Math.max(1, arr.length + delta);
        while (nuevaArr.length < nuevoLargo) nuevaArr.push(0);
        while (nuevaArr.length > nuevoLargo) nuevaArr.pop();
        copia[itemId] = nuevaArr;
      }
      return copia;
    });
  }

  function asignarCantidad(itemId: string, personaIdx: number, cantidad: number) {
    setAsignaciones((prev) => ({ ...prev, [itemId]: (prev[itemId] ?? []).map((v, i) => (i === personaIdx ? cantidad : v)) }));
  }

  function totalAsignado(itemId: string) {
    return (asignaciones[itemId] ?? []).reduce((a, b) => a + b, 0);
  }

  async function confirmarDividirPartesIguales() {
    if (!detalle) return;
    const res = await fetch(`/api/cuentas/${detalle.id}/dividir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "partes_iguales", numeroPartes }),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarToast(data.error ?? "No se pudo dividir la cuenta");
      return;
    }
    setMostrarDividir(false);
    cargarDetalle(detalle.id);
    mostrarToast("Cuenta dividida en partes iguales");
  }

  async function confirmarDividirPorItems() {
    if (!detalle) return;
    const incompleto = detalle.items.find((it) => totalAsignado(it.id) !== it.cantidad);
    if (incompleto) {
      mostrarToast(`Falta asignar "${incompleto.nombreProducto}" por completo`);
      return;
    }
    const cuerpo: { etiqueta: string; itemPedidoId: string; cantidad: number }[] = [];
    for (const item of detalle.items) {
      (asignaciones[item.id] ?? []).forEach((cantidad, idx) => {
        if (cantidad > 0) cuerpo.push({ etiqueta: nombresPersonas[idx] || `Persona ${idx + 1}`, itemPedidoId: item.id, cantidad });
      });
    }
    const res = await fetch(`/api/cuentas/${detalle.id}/dividir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "por_items", asignaciones: cuerpo }),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarToast(data.error ?? "No se pudo dividir la cuenta");
      return;
    }
    setMostrarDividir(false);
    cargarDetalle(detalle.id);
    mostrarToast("Cuenta dividida por items");
  }

  async function aplicarPropina(valor: { monto?: number; porcentaje?: number }) {
    if (!detalle) return;
    const res = await fetch(`/api/cuentas/${detalle.id}/propina`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valor),
    });
    if (!res.ok) {
      const data = await res.json();
      mostrarToast(data.error ?? "No se pudo aplicar la propina");
      return;
    }
    cargarDetalle(detalle.id);
  }

  function abrirPago(subCuentaId: string | null, sugerido: number) {
    setPagoSubCuentaId(subCuentaId);
    setPagoMonto(sugerido > 0 ? String(sugerido) : "");
    setPagoMetodo("efectivo");
    setPagoReferencia("");
    setMostrarPago(true);
  }

  async function confirmarPago() {
    if (!detalle) return;
    const monto = Number(pagoMonto);
    if (!monto || monto <= 0) {
      mostrarToast("Monto inválido");
      return;
    }
    const res = await fetch(`/api/cuentas/${detalle.id}/pagos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metodo: pagoMetodo, monto, referenciaTransaccion: pagoReferencia || undefined, subCuentaId: pagoSubCuentaId ?? undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarToast(data.error ?? "No se pudo registrar el pago");
      return;
    }
    setMostrarPago(false);
    cargarDetalle(detalle.id);
    mostrarToast("Pago registrado");
  }

  async function cerrarCuentaActual() {
    if (!detalle) return;
    const res = await fetch(`/api/cuentas/${detalle.id}/cerrar`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      mostrarToast(data.error ?? "No se pudo cerrar la cuenta");
      return;
    }
    cerrarDetalle();
    mostrarToast("Cuenta cerrada, mesa liberada");
  }

  async function confirmarMovimiento() {
    if (!turno) return;
    const monto = Number(movMonto);
    if (!monto || monto <= 0) {
      mostrarToast("Monto inválido");
      return;
    }
    const res = await fetch(`/api/turnos/${turno.id}/movimientos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: movTipo, monto, descripcion: movDescripcion || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarToast(data.error ?? "No se pudo registrar el movimiento");
      return;
    }
    setMostrarMovimiento(false);
    setMovMonto("");
    setMovDescripcion("");
    cargarTurno();
    mostrarToast("Movimiento registrado");
  }

  async function confirmarCerrarTurno() {
    if (!turno) return;
    const monto = Number(montoFinalInput) || 0;
    const res = await fetch(`/api/turnos/${turno.id}/cerrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ montoFinalDeclarado: monto }),
    });
    const data = await res.json();
    setMostrarCerrarTurno(false);
    setMontoFinalInput("");
    setTurno(null);
    if (res.ok) {
      const diferencia = data.diferencia as number;
      mostrarToast(diferencia === 0 ? "Turno cerrado, caja cuadrada ✅" : `Turno cerrado. Diferencia: ${formatoCOP(diferencia)}`);
    }
  }

  function pagadoDeSubCuenta(subCuentaId: string) {
    return (detalle?.pagos ?? []).filter((p) => p.subCuentaId === subCuentaId).reduce((a, p) => a + p.monto, 0);
  }

  if (turno === undefined) {
    return <div className="min-h-screen grid place-items-center text-sm opacity-50">Cargando...</div>;
  }

  if (turno === null) {
    return (
      <div className="min-h-screen grid place-items-center px-4" style={{ background: "var(--color-fondo)", fontFamily: "var(--fuente)" }}>
        <div className="bg-white rounded-2xl shadow-sm p-6 w-full max-w-sm">
          <h1 className="text-lg font-semibold">Abrir turno de caja</h1>
          <p className="text-sm opacity-60 mt-1">{restauranteNombre}</p>
          <label className="block text-xs font-medium opacity-70 mt-4 mb-1">Monto inicial en caja</label>
          <input
            type="number"
            value={montoInicialInput}
            onChange={(e) => setMontoInicialInput(e.target.value)}
            placeholder="0"
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
          />
          <button onClick={confirmarAbrirTurno} className="w-full text-white rounded-xl py-3 font-semibold mt-4" style={{ background: "var(--color-primario)" }}>
            Abrir turno
          </button>
        </div>
        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-white text-sm shadow-lg" style={{ background: "var(--color-secundario)" }}>
            {toast}
          </div>
        )}
      </div>
    );
  }

  const saldoPendiente = detalle ? detalle.total - detalle.totalPagado : 0;

  return (
    <div className="min-h-screen pb-10" style={{ background: "var(--color-fondo)", fontFamily: "var(--fuente)" }}>
      <header className="sticky top-0 z-20 shadow-sm bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full grid place-items-center text-white font-bold shrink-0" style={{ background: "var(--color-secundario)" }}>
            {restauranteNombre.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="font-semibold leading-tight">Caja</h1>
            <p className="text-xs opacity-60">
              Turno de {turno.usuario.nombre} · Base {formatoCOP(turno.montoInicial)}
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => setMostrarMovimiento(true)} className="text-xs font-semibold rounded-full px-3 py-2 border border-gray-300">
              Movimiento
            </button>
            <button onClick={() => setMostrarCerrarTurno(true)} className="text-xs font-semibold rounded-full px-3 py-2 text-white" style={{ background: "var(--color-primario)" }}>
              Cerrar turno
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-6">
        <section className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            Vendido en turno: <b>{formatoCOP(turno.totalPagos)}</b>
          </span>
          {Object.entries(turno.pagosPorMetodo).map(([metodo, monto]) => (
            <span key={metodo} className="opacity-70">
              {ETIQUETA_METODO[metodo] ?? metodo}: {formatoCOP(monto)}
            </span>
          ))}
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-2">Cuentas por cobrar</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {cuentas.map((c) => {
              const pendiente = c.total - c.totalPagado;
              return (
                <button
                  key={c.id}
                  onClick={() => abrirDetalleCuenta(c.id)}
                  className={`rounded-2xl border-2 p-4 text-left transition hover:brightness-95 ${
                    pendiente <= 0 ? "bg-green-50 border-green-400 text-green-700" : c.estado === "dividida" ? "bg-purple-50 border-purple-400 text-purple-700" : "bg-amber-50 border-amber-400 text-amber-800"
                  }`}
                >
                  <p className="text-2xl font-bold">Mesa {c.mesaNumero}</p>
                  <p className="text-sm font-semibold mt-1">{formatoCOP(c.total)}</p>
                  <p className="text-[11px] opacity-70 mt-0.5">{pendiente <= 0 ? "Pagado" : `Faltan ${formatoCOP(pendiente)}`}</p>
                </button>
              );
            })}
            {cuentas.length === 0 && <p className="text-sm opacity-50 col-span-full">No hay cuentas abiertas ahora mismo.</p>}
          </div>
        </section>
      </main>

      {detalle && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={cerrarDetalle} />
          <div className="absolute bottom-0 left-0 right-0 sm:m-auto sm:relative sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">Mesa {detalle.mesaNumero}</h3>

            <div className="space-y-2 mt-3">
              {detalle.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
                  <span>
                    {it.nombreProducto} <span className="opacity-50">× {it.cantidad}</span>
                    {it.adicionales.length > 0 && <span className="block text-xs opacity-50">+ {it.adicionales.map((a) => a.nombre).join(", +")}</span>}
                  </span>
                  <span className="font-medium">{formatoCOP(it.precioUnitario * it.cantidad + it.adicionales.reduce((a, ad) => a + ad.precioUnitario * ad.cantidad, 0))}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-sm mt-3">
              <div className="flex justify-between">
                <span className="opacity-60">Subtotal</span>
                <span>{formatoCOP(detalle.subtotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="opacity-60">Propina</span>
                <div className="flex gap-1">
                  {[0, 10, 15].map((pct) => (
                    <button key={pct} onClick={() => aplicarPropina({ porcentaje: pct })} className="text-xs border border-gray-300 rounded-full px-2 py-0.5">
                      {pct}%
                    </button>
                  ))}
                </div>
                <span>{formatoCOP(detalle.propina)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-1">
                <span>Total</span>
                <span>{formatoCOP(detalle.total)}</span>
              </div>
              <div className="flex justify-between text-xs opacity-60">
                <span>Pagado</span>
                <span>{formatoCOP(detalle.totalPagado)}</span>
              </div>
            </div>

            {detalle.subCuentas.length > 0 ? (
              <div className="space-y-2 mt-4">
                <p className="text-xs font-semibold uppercase opacity-60">División de cuenta</p>
                {detalle.subCuentas.map((s) => {
                  const pagado = pagadoDeSubCuenta(s.id);
                  const pendiente = s.monto - pagado;
                  return (
                    <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 text-sm">
                      <span>
                        {s.etiqueta} <span className="opacity-50">· {formatoCOP(s.monto)}</span>
                      </span>
                      {pendiente <= 0 ? (
                        <span className="text-xs text-green-700 font-semibold">Pagado</span>
                      ) : (
                        <button onClick={() => abrirPago(s.id, pendiente)} className="text-xs font-semibold text-white rounded-full px-3 py-1.5" style={{ background: "var(--color-primario)" }}>
                          Pagar {formatoCOP(pendiente)}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              saldoPendiente > 0 && (
                <button onClick={() => abrirPago(null, saldoPendiente)} className="w-full text-white rounded-xl py-2.5 text-sm font-semibold mt-4" style={{ background: "var(--color-primario)" }}>
                  Registrar pago de {formatoCOP(saldoPendiente)}
                </button>
              )
            )}

            {detalle.pagos.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold uppercase opacity-60">Pagos recibidos</p>
                {detalle.pagos.map((p) => (
                  <div key={p.id} className="flex justify-between text-xs opacity-70">
                    <span>{ETIQUETA_METODO[p.metodo] ?? p.metodo}</span>
                    <span>{formatoCOP(p.monto)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={iniciarDividir} className="border border-gray-300 rounded-xl py-2.5 text-sm font-semibold">
                Dividir cuenta
              </button>
              <button
                onClick={cerrarCuentaActual}
                disabled={saldoPendiente > 0}
                className="text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40"
                style={{ background: "var(--color-primario)" }}
              >
                Cerrar cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarDividir && detalle && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMostrarDividir(false)} />
          <div className="absolute bottom-0 left-0 right-0 sm:m-auto sm:relative sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">Dividir cuenta — Mesa {detalle.mesaNumero}</h3>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setModoDividir("partes_iguales")}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold ${modoDividir === "partes_iguales" ? "text-white" : "border border-gray-300"}`}
                style={modoDividir === "partes_iguales" ? { background: "var(--color-primario)" } : undefined}
              >
                Partes iguales
              </button>
              <button
                onClick={() => setModoDividir("por_items")}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold ${modoDividir === "por_items" ? "text-white" : "border border-gray-300"}`}
                style={modoDividir === "por_items" ? { background: "var(--color-primario)" } : undefined}
              >
                Por items
              </button>
            </div>

            {modoDividir === "partes_iguales" ? (
              <div className="mt-5">
                <p className="text-sm opacity-60 mb-2">¿En cuántas partes?</p>
                <div className="flex items-center gap-4">
                  <button onClick={() => setNumeroPartes((n) => Math.max(2, n - 1))} className="w-9 h-9 rounded-full border border-gray-300 text-lg font-bold">
                    −
                  </button>
                  <span className="text-xl font-bold w-8 text-center">{numeroPartes}</span>
                  <button onClick={() => setNumeroPartes((n) => n + 1)} className="w-9 h-9 rounded-full border border-gray-300 text-lg font-bold">
                    +
                  </button>
                  <span className="text-sm opacity-60 ml-auto">{formatoCOP(detalle.total / numeroPartes)} c/u</span>
                </div>
                <button onClick={confirmarDividirPartesIguales} className="w-full text-white rounded-xl py-3 font-semibold mt-5" style={{ background: "var(--color-primario)" }}>
                  Confirmar división
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm opacity-60">Personas:</span>
                  <button onClick={() => cambiarNumPersonas(-1)} className="w-8 h-8 rounded-full border border-gray-300 font-bold">
                    −
                  </button>
                  <span className="font-bold">{nombresPersonas.length}</span>
                  <button onClick={() => cambiarNumPersonas(1)} className="w-8 h-8 rounded-full border border-gray-300 font-bold">
                    +
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left pb-1">Item</th>
                        {nombresPersonas.map((nombre, idx) => (
                          <th key={idx} className="pb-1 px-1">
                            <input
                              value={nombre}
                              onChange={(e) =>
                                setNombresPersonas((prev) => prev.map((n, i) => (i === idx ? e.target.value : n)))
                              }
                              className="w-16 text-center border-b border-gray-300 font-semibold"
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.items.map((it) => (
                        <tr key={it.id}>
                          <td className="py-1 pr-2">
                            {it.nombreProducto}
                            <span className={`ml-1 ${totalAsignado(it.id) === it.cantidad ? "text-green-600" : "text-amber-600"}`}>
                              ({totalAsignado(it.id)}/{it.cantidad})
                            </span>
                          </td>
                          {nombresPersonas.map((_, idx) => (
                            <td key={idx} className="px-1">
                              <input
                                type="number"
                                min={0}
                                max={it.cantidad}
                                value={(asignaciones[it.id] ?? [])[idx] ?? 0}
                                onChange={(e) => asignarCantidad(it.id, idx, Math.max(0, Number(e.target.value)))}
                                className="w-12 text-center border border-gray-300 rounded"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={confirmarDividirPorItems} className="w-full text-white rounded-xl py-3 font-semibold mt-5" style={{ background: "var(--color-primario)" }}>
                  Confirmar división
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {mostrarPago && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMostrarPago(false)} />
          <div className="absolute bottom-0 left-0 right-0 sm:m-auto sm:relative sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">Registrar pago</h3>
            <label className="block text-xs font-medium opacity-70 mt-4 mb-1">Método</label>
            <select value={pagoMetodo} onChange={(e) => setPagoMetodo(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm">
              {Object.entries(ETIQUETA_METODO).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
            <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Monto</label>
            <input type="number" value={pagoMonto} onChange={(e) => setPagoMonto(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
            {pagoMetodo !== "efectivo" && (
              <>
                <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Referencia (opcional)</label>
                <input value={pagoReferencia} onChange={(e) => setPagoReferencia(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
              </>
            )}
            <button onClick={confirmarPago} className="w-full text-white rounded-xl py-3 font-semibold mt-4" style={{ background: "var(--color-primario)" }}>
              Confirmar pago
            </button>
          </div>
        </div>
      )}

      {mostrarMovimiento && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMostrarMovimiento(false)} />
          <div className="absolute bottom-0 left-0 right-0 sm:m-auto sm:relative sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">Movimiento de caja</h3>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setMovTipo("retiro")}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold ${movTipo === "retiro" ? "text-white" : "border border-gray-300"}`}
                style={movTipo === "retiro" ? { background: "var(--color-primario)" } : undefined}
              >
                Retiro
              </button>
              <button
                onClick={() => setMovTipo("ingreso_manual")}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold ${movTipo === "ingreso_manual" ? "text-white" : "border border-gray-300"}`}
                style={movTipo === "ingreso_manual" ? { background: "var(--color-primario)" } : undefined}
              >
                Ingreso manual
              </button>
            </div>
            <label className="block text-xs font-medium opacity-70 mt-4 mb-1">Monto</label>
            <input type="number" value={movMonto} onChange={(e) => setMovMonto(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
            <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Descripción (opcional)</label>
            <input value={movDescripcion} onChange={(e) => setMovDescripcion(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
            <button onClick={confirmarMovimiento} className="w-full text-white rounded-xl py-3 font-semibold mt-4" style={{ background: "var(--color-primario)" }}>
              Registrar
            </button>
          </div>
        </div>
      )}

      {mostrarCerrarTurno && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMostrarCerrarTurno(false)} />
          <div className="absolute bottom-0 left-0 right-0 sm:m-auto sm:relative sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">Cerrar turno y arqueo</h3>
            <div className="text-sm mt-3 space-y-1">
              <div className="flex justify-between">
                <span className="opacity-60">Base inicial</span>
                <span>{formatoCOP(turno.montoInicial)}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-60">Sistema espera en caja</span>
                <span className="font-semibold">{formatoCOP(turno.montoSistemaActual ?? 0)}</span>
              </div>
            </div>
            <label className="block text-xs font-medium opacity-70 mt-4 mb-1">Monto contado físicamente</label>
            <input type="number" value={montoFinalInput} onChange={(e) => setMontoFinalInput(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
            <button onClick={confirmarCerrarTurno} className="w-full text-white rounded-xl py-3 font-semibold mt-4" style={{ background: "var(--color-primario)" }}>
              Cerrar turno
            </button>
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
