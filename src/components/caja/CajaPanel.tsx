"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEventos } from "@/lib/useEventos";
import { useRefrescoPeriodico } from "@/lib/useRefrescoPeriodico";
import { reproducirBeep } from "@/lib/beep";
import { HistorialVentasTab } from "@/components/admin/HistorialVentasTab";
import { FacturasProveedorTab } from "@/components/admin/FacturasProveedorTab";
import { MeseroPanel } from "@/components/mesero/MeseroPanel";
import { LlamadosLista, type LlamadoPendiente } from "@/components/mesero/LlamadosLista";
import { AsignarMesero } from "@/components/mesero/AsignarMesero";
import { PedidosExternosTab, type PedidoExterno, type SolicitudPendiente } from "./PedidosExternosTab";
import { ArqueoInventarioTab } from "./ArqueoInventarioTab";
import { ICONO_SERVICIO, type TipoServicio } from "@/lib/servicio";
import { imprimirCuenta } from "@/lib/imprimir";

type TurnoResumen = {
  id: string;
  estado: "abierto" | "cerrado";
  montoInicial: number;
  abiertoEn: string;
  usuario: { nombre: string };
  movimientos: { id: string; tipo: string; monto: number; descripcion: string | null; creadoEn: string }[];
  totalPagos: number;
  pagosPorMetodo: Record<string, number>;
  cantidadVentas: number;
  cantidadPagos: number;
  ticketPromedio: number;
  montoSistemaActual: number | null;
};

type CuentaResumen = {
  id: string;
  tipo: TipoServicio;
  // "Mesa 5", "Domicilio #12" o "Para llevar #7" (los dos ultimos no tienen mesa: mesaId null).
  etiqueta: string;
  clienteNombre: string | null;
  mesaId: string | null;
  mesaNumero: string | null;
  // "cuenta_solicitada" = la cuenta ya se cerro (mesero, caja o cliente) y espera el cobro.
  mesaEstado: string | null;
  meseroId: string | null;
  meseroNombre: string | null;
  estado: string;
  subtotal: number;
  propina: number;
  costoDomicilio: number;
  total: number;
  totalPagado: number;
  creadoEn: string;
};

type CuentaCobrada = { id: string; etiqueta: string; cerradoEn: string; total: number; pagos: { metodo: string; monto: number }[] };

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
  tipo: TipoServicio;
  etiqueta: string;
  // Datos del cliente en los pedidos para llevar / domicilio; null en una mesa.
  cliente: { nombre: string | null; telefono: string | null; direccion: string | null; domiciliario: string | null; notas: string | null } | null;
  mesaId: string | null;
  mesaNumero: string | null;
  meseroId: string | null;
  meseroNombre: string | null;
  estado: string;
  subtotal: number;
  propina: number;
  costoDomicilio: number;
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

export function CajaPanel({ restauranteNombre, usuarioId, rol }: { restauranteNombre: string; usuarioId: string; rol: string }) {
  const [turno, setTurno] = useState<TurnoResumen | null | undefined>(undefined);
  const [montoInicialInput, setMontoInicialInput] = useState("");
  const [cuentas, setCuentas] = useState<CuentaResumen[]>([]);
  const [cobradas, setCobradas] = useState<CuentaCobrada[]>([]);
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
  // Preferencia de este equipo: imprimir el ticket apenas se salda una cuenta.
  const [imprimirAlCobrar, setImprimirAlCobrar] = useState(() => {
    try {
      return window.localStorage.getItem("caja-imprimir-al-cobrar") === "1";
    } catch {
      return false;
    }
  });

  const [mostrarMovimiento, setMostrarMovimiento] = useState(false);
  const [movTipo, setMovTipo] = useState<"retiro" | "ingreso_manual">("retiro");
  const [movMonto, setMovMonto] = useState("");
  const [movDescripcion, setMovDescripcion] = useState("");

  const [mostrarCerrarTurno, setMostrarCerrarTurno] = useState(false);
  const [montoFinalInput, setMontoFinalInput] = useState("");

  const [vista, setVista] = useState<"caja" | "salon" | "externos" | "historial" | "facturas" | "arqueo">("caja");
  // Pedidos para llevar y a domicilio en marcha (sin entregar todavia o sin cobrar).
  const [pedidosExternos, setPedidosExternos] = useState<PedidoExterno[]>([]);
  // Pedidos que los clientes mandaron por el link y esperan que caja los acepte o rechace.
  const [solicitudes, setSolicitudes] = useState<SolicitudPendiente[]>([]);
  // Cuenta que estoy cerrando yo: su aviso "cuenta cerrada" en vivo no es de "otra caja".
  const cierrePropioRef = useRef<string | null>(null);
  // Llamados de TODOS los meseros ("Llaman al mesero" / "Piden la cuenta"): caja los ve
  // y salen de la lista cuando alguien pulsa "Atender" o se cobra la cuenta de esa mesa.
  const [llamados, setLlamados] = useState<LlamadoPendiente[]>([]);
  const [nuevosIds, setNuevosIds] = useState<Set<string>>(new Set());

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  async function imprimirTicket(cuentaId: string) {
    try {
      await imprimirCuenta(cuentaId);
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "No se pudo imprimir");
    }
  }

  function cambiarImprimirAlCobrar(activo: boolean) {
    setImprimirAlCobrar(activo);
    try {
      window.localStorage.setItem("caja-imprimir-al-cobrar", activo ? "1" : "0");
    } catch {
      // sin almacenamiento: la preferencia vale solo mientras esta abierta la pantalla
    }
  }

  const cargarTurno = useCallback(() => fetch("/api/turnos").then((r) => r.json()).then(setTurno), []);
  const cargarCuentas = useCallback(
    () =>
      fetch("/api/cuentas")
        .then((r) => r.json())
        .then((lista: unknown) => {
          if (Array.isArray(lista)) setCuentas(lista as CuentaResumen[]);
        }),
    []
  );
  const cargarDetalle = useCallback((id: string) => fetch(`/api/cuentas/${id}`).then((r) => r.json()).then(setDetalle), []);
  // Cuentas ya cobradas y cerradas desde que se abrio el turno (con su valor).
  const abiertoEn = turno?.abiertoEn;
  const cargarCobradas = useCallback(() => {
    if (!abiertoEn) return Promise.resolve();
    return fetch(`/api/ventas?desde=${encodeURIComponent(abiertoEn)}`)
      .then((r) => r.json())
      .then((lista: unknown) => {
        if (Array.isArray(lista)) setCobradas(lista as CuentaCobrada[]);
      });
  }, [abiertoEn]);
  const cargarLlamados = useCallback(
    () =>
      fetch("/api/llamados")
        .then((r) => r.json())
        .then((lista: unknown) => {
          if (Array.isArray(lista)) setLlamados(lista as LlamadoPendiente[]);
        }),
    []
  );

  const cargarExternos = useCallback(
    () =>
      fetch("/api/pedidos-externos")
        .then((r) => r.json())
        .then((lista: unknown) => {
          if (Array.isArray(lista)) setPedidosExternos(lista as PedidoExterno[]);
        }),
    []
  );

  const cargarSolicitudes = useCallback(
    () =>
      fetch("/api/solicitudes-pedido")
        .then((r) => r.json())
        .then((lista: unknown) => {
          if (Array.isArray(lista)) setSolicitudes(lista as SolicitudPendiente[]);
        }),
    []
  );

  // Aceptar un pedido del link crea un pedido para llevar / domicilio: se recargan las dos listas.
  const recargarDomicilios = useCallback(() => {
    cargarExternos();
    cargarSolicitudes();
  }, [cargarExternos, cargarSolicitudes]);

  useEffect(() => {
    cargarTurno();
    cargarLlamados();
    cargarExternos();
    cargarSolicitudes();
  }, [cargarTurno, cargarLlamados, cargarExternos, cargarSolicitudes]);

  // Red de seguridad del canal en vivo: llamados, cuentas y pedidos para llevar / domicilio se refrescan solos.
  useRefrescoPeriodico(() => {
    cargarLlamados();
    cargarCuentas();
    cargarExternos();
    cargarSolicitudes();
  });

  useEffect(() => {
    if (turno) cargarCuentas();
  }, [turno, cargarCuentas]);

  useEffect(() => {
    cargarCobradas();
  }, [cargarCobradas]);

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
      cargarExternos();
      const p = payload as { cuentaId: string };
      if (cuentaSeleccionadaId === p.cuentaId) cargarDetalle(p.cuentaId);
    },
    "cuenta-cerrada": (payload) => {
      cargarCuentas();
      cargarCobradas();
      cargarExternos();
      const p = payload as { cuentaId: string };
      if (cuentaSeleccionadaId === p.cuentaId) {
        cerrarDetalle();
        // El aviso en vivo puede llegar antes que la respuesta de mi propio cierre: solo avisa si la cerro otra caja.
        if (cierrePropioRef.current !== p.cuentaId) mostrarToast("Esa cuenta se cerró desde otra caja");
      }
    },
    "pedido-creado": () => {
      cargarCuentas();
      cargarExternos();
    },
    // Cocina avanza un plato o se entrega un pedido: cambia el estado de los pedidos para llevar / domicilio.
    "item-actualizado": () => cargarExternos(),
    "pedido-entregado": () => cargarExternos(),
    // Un cliente mando un pedido por el link: suena en cualquier vista, porque hay que responderlo pronto.
    "solicitud-creada": (payload) => {
      const p = payload as { tipo?: string; clienteNombre?: string };
      cargarSolicitudes();
      reproducirBeep();
      mostrarToast(`🔔 Nuevo pedido por el link — ${p.tipo === "domicilio" ? "Domicilio" : "Para llevar"}${p.clienteNombre ? ` · ${p.clienteNombre}` : ""}`);
    },
    // Otra caja lo acepto o rechazo: sale de la lista.
    "solicitud-actualizada": () => recargarDomicilios(),
    // Caja ve los llamados de todos los meseros. En "Mesas y pedidos" el propio panel avisa y
    // suena; en las demas vistas avisa Caja (lista + pitido + aviso).
    "llamado-creado": (payload) => {
      const l = payload as LlamadoPendiente;
      setLlamados((prev) => (prev.some((x) => x.id === l.id) ? prev : [l, ...prev]));
      if (vista === "salon") return;
      setNuevosIds((prev) => new Set(prev).add(l.id));
      setTimeout(() => setNuevosIds((prev) => { const s = new Set(prev); s.delete(l.id); return s; }), 3000);
      reproducirBeep();
      mostrarToast(`${l.tipo === "llamar_mesero" ? "🛎️ Llaman al mesero" : "🧾 Piden la cuenta"} — Mesa ${l.mesaNumero}`);
    },
    // El mesero (o Caja) pulso "Atender": el llamado desaparece de la lista de Caja.
    "llamado-atendido": (payload) => {
      const { id } = payload as { id: string };
      setLlamados((prev) => prev.filter((l) => l.id !== id));
    },
    // La mesa cambio de mesero o de estado: se actualizan las cuentas y el nombre del mesero en los llamados.
    "mesa-actualizada": () => {
      cargarCuentas();
      cargarLlamados();
    },
  });

  async function atenderLlamado(id: string) {
    const res = await fetch(`/api/llamados/${id}`, { method: "PATCH" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      mostrarToast(data.error ?? "No se pudo atender el llamado");
      cargarLlamados();
      return;
    }
    setLlamados((prev) => prev.filter((l) => l.id !== id));
    mostrarToast("Llamado atendido ✅");
  }

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
    // Si con este pago queda saldada, la cuenta se cierra sola y la mesa se libera.
    if (detalle.totalPagado + monto >= detalle.total) {
      const cuentaId = detalle.id;
      await cerrarCuentaDe(cuentaId, `${detalle.etiqueta} cobrado: ${formatoCOP(detalle.total)} — cuenta cerrada${detalle.mesaId ? ", mesa liberada" : ""}`);
      if (imprimirAlCobrar) await imprimirTicket(cuentaId);
      return;
    }
    cargarDetalle(detalle.id);
    mostrarToast("Pago registrado");
  }

  async function cerrarCuentaDe(id: string, mensaje: string) {
    cierrePropioRef.current = id;
    const res = await fetch(`/api/cuentas/${id}/cerrar`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      cierrePropioRef.current = null;
      mostrarToast(data.error ?? "No se pudo cerrar la cuenta");
      cargarDetalle(id);
      return;
    }
    cerrarDetalle();
    cargarCuentas();
    cargarCobradas();
    cargarTurno();
    mostrarToast(mensaje);
  }

  function cerrarCuentaActual() {
    if (detalle) return cerrarCuentaDe(detalle.id, `${detalle.etiqueta} cerrado${detalle.mesaId ? ", mesa liberada" : ""}`);
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

  const saldoPendiente = detalle ? detalle.total - detalle.totalPagado : 0;
  const detalleCerrada = !!detalle && cuentas.find((c) => c.id === detalle.id)?.mesaEstado === "cuenta_solicitada";
  // Las cuentas que ya cerro el mesero (o el cliente) van primero: son las que hay que cobrar.
  const cuentasOrdenadas = [...cuentas].sort((a, b) => Number(b.mesaEstado === "cuenta_solicitada") - Number(a.mesaEstado === "cuenta_solicitada"));

  return (
    <div className="min-h-screen pb-10" style={{ background: "var(--color-fondo)", fontFamily: "var(--fuente)" }}>
      <header className="sticky top-0 z-20 shadow-sm bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-full grid place-items-center text-white font-bold shrink-0" style={{ background: "var(--color-secundario)" }}>
            {restauranteNombre.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="font-semibold leading-tight">Caja</h1>
            <p className="text-xs opacity-60">{turno ? `Turno de ${turno.usuario.nombre} · Base ${formatoCOP(turno.montoInicial)}` : "Sin turno abierto"}</p>
          </div>
          {turno && (
            <div className="ml-auto flex gap-2">
              <button onClick={() => setMostrarMovimiento(true)} className="text-xs font-semibold rounded-full px-3 py-2 border border-gray-300">
                Movimiento
              </button>
              <button onClick={() => setMostrarCerrarTurno(true)} className="text-xs font-semibold rounded-full px-3 py-2 text-white" style={{ background: "var(--color-primario)" }}>
                Cerrar turno
              </button>
            </div>
          )}
          <nav className="flex gap-1 w-full overflow-x-auto">
            {(
              [
                ["caja", "Caja"],
                ["salon", "Mesas y pedidos"],
                ["externos", "Domicilios y para llevar"],
                ["historial", "Historial de ventas"],
                ["facturas", "Facturas de proveedor"],
                ["arqueo", "Arqueo de inventario"],
              ] as const
            ).map(([id, nombre]) => (
              <button
                key={id}
                onClick={() => setVista(id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${vista === id ? "text-white" : "opacity-60"}`}
                style={vista === id ? { background: "var(--color-secundario)" } : undefined}
              >
                {nombre}
                {(id === "salon" || id === "caja") && llamados.length > 0 && (
                  <span className="ml-1.5 bg-red-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold">{llamados.length}</span>
                )}
                {id === "externos" && solicitudes.length > 0 && (
                  <span className="ml-1.5 bg-orange-500 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold" title="Pedidos por confirmar">
                    🔔 {solicitudes.length}
                  </span>
                )}
                {id === "externos" && pedidosExternos.length > 0 && (
                  <span className="ml-1.5 bg-blue-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold">{pedidosExternos.length}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-6">
        {vista === "salon" && <MeseroPanel embebido usuarioId={usuarioId} rol={rol} />}
        {vista === "externos" && (
          <PedidosExternosTab pedidos={pedidosExternos} solicitudes={solicitudes} hayTurno={!!turno} onRecargar={recargarDomicilios} onCobrar={abrirDetalleCuenta} onCambio={mostrarToast} />
        )}
        {vista === "historial" && <HistorialVentasTab onCambio={mostrarToast} />}
        {vista === "facturas" && <FacturasProveedorTab onCambio={mostrarToast} />}
        {vista === "arqueo" && <ArqueoInventarioTab onCambio={mostrarToast} />}
        {vista === "caja" && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Llamados pendientes ({llamados.length})</h2>
            <p className="text-xs opacity-50 mb-2">Mesas que llaman al mesero o piden la cuenta, de todos los meseros. Salen de la lista cuando el mesero pulsa &ldquo;Atender&rdquo; o se cobra la cuenta.</p>
            <LlamadosLista llamados={llamados} nuevosIds={nuevosIds} mostrarMesero onAtender={atenderLlamado} />
          </section>
        )}
        {vista === "caja" && !turno && (
          <div className="bg-white rounded-2xl shadow-sm p-6 w-full max-w-sm mx-auto">
            <h2 className="text-lg font-semibold">Abrir turno de caja</h2>
            <p className="text-sm opacity-60 mt-1">{restauranteNombre}</p>
            <p className="text-xs opacity-50 mt-1">Para cobrar necesitas un turno abierto. Mesas, pedidos, historial y facturas los puedes usar sin turno.</p>
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
        )}
        {vista === "caja" && turno && (
        <>
        <section className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            Vendido en turno: <b>{formatoCOP(turno.totalPagos)}</b>
          </span>
          <span className="opacity-70">
            Ventas: <b>{turno.cantidadVentas}</b>
            {turno.cantidadPagos !== turno.cantidadVentas && ` (${turno.cantidadPagos} pagos)`}
          </span>
          <span className="opacity-70">Ticket promedio: {formatoCOP(turno.ticketPromedio)}</span>
          {Object.entries(turno.pagosPorMetodo).map(([metodo, monto]) => (
            <span key={metodo} className="opacity-70">
              {ETIQUETA_METODO[metodo] ?? metodo}: {formatoCOP(monto)}
            </span>
          ))}
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Cuentas activas ({cuentas.length})</h2>
          <p className="text-xs opacity-50 mb-2">Todas las mesas con consumo, y los pedidos para llevar y a domicilio. Las que ya cerró el mesero salen primero, con el valor listo para cobrar.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {cuentasOrdenadas.map((c) => {
              const pendiente = c.total - c.totalPagado;
              const cerrada = c.mesaEstado === "cuenta_solicitada";
              const estilo =
                pendiente <= 0
                  ? "bg-green-50 border-green-400 text-green-700"
                  : cerrada
                    ? "bg-amber-100 border-amber-500 text-amber-900"
                    : c.estado === "dividida"
                      ? "bg-purple-50 border-purple-400 text-purple-700"
                      : "bg-blue-50 border-blue-300 text-blue-800";
              const etiqueta = pendiente <= 0 ? "Pagada" : cerrada ? "🧾 Cuenta cerrada" : "En curso";
              return (
                <button key={c.id} onClick={() => abrirDetalleCuenta(c.id)} className={`rounded-2xl border-2 p-4 text-left transition hover:brightness-95 ${estilo}`}>
                  <p className={`${c.mesaId ? "text-2xl" : "text-lg"} font-bold leading-tight`}>
                    {c.mesaId ? c.etiqueta : `${ICONO_SERVICIO[c.tipo]} ${c.etiqueta}`}
                  </p>
                  <p className="text-lg font-bold mt-0.5">{formatoCOP(c.total)}</p>
                  <p className="text-[11px] font-semibold mt-0.5">
                    {etiqueta}
                    {c.estado === "dividida" && " · dividida"}
                  </p>
                  {pendiente > 0 && c.totalPagado > 0 && <p className="text-[11px] opacity-70">Faltan {formatoCOP(pendiente)}</p>}
                  <p className="text-[11px] font-medium mt-1 truncate">{c.mesaId ? `🧑‍🍳 ${c.meseroNombre ?? "Sin mesero"}` : `👤 ${c.clienteNombre ?? "Sin nombre"}`}</p>
                </button>
              );
            })}
            {cuentas.length === 0 && <p className="text-sm opacity-50 col-span-full">No hay cuentas activas ahora mismo.</p>}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-2">Cuentas cobradas en este turno ({cobradas.length})</h2>
          {cobradas.length === 0 ? (
            <p className="text-sm opacity-50">Todavía no se ha cobrado ninguna cuenta.</p>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
              {cobradas.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="font-semibold w-36 shrink-0 truncate">{c.etiqueta}</span>
                  <span className="text-xs opacity-60 flex-1 truncate">
                    {new Date(c.cerradoEn).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" })}
                    {" · "}
                    {[...new Set(c.pagos.map((p) => ETIQUETA_METODO[p.metodo] ?? p.metodo))].join(", ")}
                  </span>
                  <span className="font-bold">{formatoCOP(c.total)}</span>
                  <button onClick={() => imprimirTicket(c.id)} title="Imprimir ticket" aria-label={`Imprimir ticket de ${c.etiqueta}`} className="text-sm border border-gray-300 rounded-full w-8 h-8 shrink-0">
                    🖨️
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        </>
        )}
      </main>

      {detalle && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={cerrarDetalle} />
          <div className="absolute bottom-0 left-0 right-0 sm:m-auto sm:relative sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">
              {detalle.mesaId ? detalle.etiqueta : `${ICONO_SERVICIO[detalle.tipo]} ${detalle.etiqueta}`}
            </h3>
            {detalle.mesaId ? (
              <p className="text-xs opacity-60">Atiende: {detalle.meseroNombre ?? "sin mesero"}</p>
            ) : (
              detalle.cliente && (
                <div className="mt-1 text-sm space-y-0.5">
                  <p>
                    👤 <b>{detalle.cliente.nombre}</b>
                    {detalle.cliente.telefono && <span className="opacity-70"> · 📞 {detalle.cliente.telefono}</span>}
                  </p>
                  {detalle.cliente.direccion && <p className="opacity-80">📍 {detalle.cliente.direccion}</p>}
                  {detalle.cliente.domiciliario && <p className="text-xs opacity-60">🛵 Domiciliario: {detalle.cliente.domiciliario}</p>}
                  {detalle.cliente.notas && <p className="text-xs bg-amber-50 text-amber-900 rounded-lg px-2 py-1">📝 {detalle.cliente.notas}</p>}
                </div>
              )
            )}
            {detalleCerrada && <p className="mt-2 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-3 py-1.5 text-xs">🧾 Cuenta cerrada — lista para cobrar</p>}
            {detalle.mesaId && (
              <div className="mt-3">
                <AsignarMesero
                  key={detalle.mesaId}
                  mesaId={detalle.mesaId}
                  meseroIdActual={detalle.meseroId}
                  onAsignado={(mesero) => {
                    cargarDetalle(detalle.id);
                    cargarCuentas();
                    cargarLlamados();
                    mostrarToast(mesero ? `${detalle.etiqueta} asignada a ${mesero.nombre}` : `${detalle.etiqueta} quedó sin mesero`);
                  }}
                  onError={mostrarToast}
                />
              </div>
            )}

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
              {detalle.costoDomicilio > 0 && (
                <div className="flex justify-between">
                  <span className="opacity-60">Domicilio</span>
                  <span>{formatoCOP(detalle.costoDomicilio)}</span>
                </div>
              )}
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
              <button onClick={() => imprimirTicket(detalle.id)} className="col-span-2 border border-gray-300 rounded-xl py-2.5 text-sm font-semibold">
                🖨️ {detalle.estado === "pagada" || saldoPendiente <= 0 ? "Imprimir ticket" : "Imprimir cuenta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarDividir && detalle && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMostrarDividir(false)} />
          <div className="absolute bottom-0 left-0 right-0 sm:m-auto sm:relative sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">Dividir cuenta — {detalle.etiqueta}</h3>
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
            <label className="flex items-center gap-2 text-xs mt-3 cursor-pointer">
              <input type="checkbox" checked={imprimirAlCobrar} onChange={(e) => cambiarImprimirAlCobrar(e.target.checked)} />
              <span>🖨️ Imprimir el ticket al saldar la cuenta (en este equipo)</span>
            </label>
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

      {mostrarCerrarTurno && turno && (
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
                <span className="opacity-60">Ventas del turno</span>
                <span>
                  {turno.cantidadVentas} {turno.cantidadVentas === 1 ? "venta" : "ventas"}
                  {turno.cantidadPagos !== turno.cantidadVentas && ` · ${turno.cantidadPagos} pagos`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-60">Ticket promedio</span>
                <span>{formatoCOP(turno.ticketPromedio)}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-60">Vendido en turno</span>
                <span>{formatoCOP(turno.totalPagos)}</span>
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
