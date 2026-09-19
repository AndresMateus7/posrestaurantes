"use client";

import { useEffect, useState } from "react";
import { PedidoMesero } from "@/components/mesero/PedidoMesero";
import { ETIQUETA_ENTREGA, ICONO_SERVICIO, type EstadoEntrega } from "@/lib/servicio";

// Pedidos para llevar y a domicilio: los saca caja. Se eligen los platos del menu como en una mesa,
// pero sin mesa: van a cocina con el nombre del cliente y se cobran en Caja como cualquier cuenta.

export type PedidoExterno = {
  id: string;
  tipo: "llevar" | "domicilio";
  numero: number | null;
  etiqueta: string;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  direccion: string | null;
  domiciliario: string | null;
  notas: string | null;
  costoDomicilio: number;
  subtotal: number;
  propina: number;
  total: number;
  totalPagado: number;
  estadoCuenta: string;
  despachadoEn: string | null;
  creadoEn: string;
  estadoEntrega: EstadoEntrega;
  platos: { id: string; nombre: string; cantidad: number; estado: string; adicionales: string[] }[];
};

/** Pedido que un cliente mando por el link publico y espera que caja lo acepte. */
export type SolicitudPendiente = {
  id: string;
  tipo: "llevar" | "domicilio";
  clienteNombre: string;
  clienteTelefono: string;
  direccion: string | null;
  notas: string | null;
  pago: string | null;
  pagaCon: number | null;
  platos: {
    productoId: string;
    nombre: string;
    cantidad: number;
    precioUnitario: number;
    ingredientesRemovidos: { id: string; nombre: string }[];
    adicionales: { id: string; nombre: string; precio: number }[];
  }[];
  subtotal: number;
  costoDomicilio: number;
  total: number;
  creadoEn: string;
};

type DatosForm = {
  tipo: "llevar" | "domicilio";
  clienteNombre: string;
  clienteTelefono: string;
  direccion: string;
  costoDomicilio: string;
  domiciliario: string;
  notas: string;
};

const formatoCOP = (v: number) => "$" + Math.round(v).toLocaleString("es-CO");
const formVacio = (tipo: "llevar" | "domicilio"): DatosForm => ({ tipo, clienteNombre: "", clienteTelefono: "", direccion: "", costoDomicilio: "", domiciliario: "", notas: "" });

const CLASE_ENTREGA: Record<EstadoEntrega, string> = {
  sin_platos: "bg-gray-100 text-gray-600",
  en_cocina: "bg-amber-100 text-amber-800",
  listo: "bg-green-100 text-green-800",
  en_camino: "bg-blue-100 text-blue-800",
  entregado: "bg-gray-100 text-gray-600",
};

function haceCuanto(iso: string, ahora: number) {
  const min = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h ${min % 60} min`;
}

const ETIQUETA_PAGO: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia (Nequi, Daviplata…)", datafono: "Datáfono" };

// Un pedido del link: caja lo revisa y lo acepta (va a cocina) o lo rechaza con un motivo que ve el cliente.
function TarjetaSolicitud({ s, ahora, onCambio, onRecargar }: { s: SolicitudPendiente; ahora: number; onCambio: (msg: string) => void; onRecargar: () => void }) {
  const [costo, setCosto] = useState(String(s.costoDomicilio));
  const [ocupada, setOcupada] = useState(false);
  const costoNum = costo.trim() === "" ? 0 : Number(costo);
  const totalAhora = s.subtotal + (s.tipo === "domicilio" ? (Number.isFinite(costoNum) ? costoNum : 0) : 0);

  async function responder(accion: "aceptar" | "rechazar") {
    let cuerpo: Record<string, unknown> = {};
    if (accion === "aceptar") {
      if (s.tipo === "domicilio" && (!Number.isInteger(costoNum) || costoNum < 0)) {
        onCambio("El valor del domicilio no es válido");
        return;
      }
      cuerpo = s.tipo === "domicilio" ? { costoDomicilio: costoNum } : {};
    } else {
      const motivo = window.prompt("¿Por qué lo rechazas? (opcional — el cliente lo verá)");
      if (motivo === null) return;
      cuerpo = { motivo };
    }

    setOcupada(true);
    try {
      const res = await fetch(`/api/solicitudes-pedido/${s.id}/${accion}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) onCambio(data.error ?? "No se pudo responder el pedido");
      else onCambio(accion === "aceptar" ? `${s.tipo === "domicilio" ? "Domicilio" : "Para llevar"} #${data.numero} aceptado y enviado a cocina 👨‍🍳` : "Pedido rechazado");
      onRecargar();
    } finally {
      setOcupada(false);
    }
  }

  return (
    // Los textos los escribe el cliente: una palabra larguisima no debe ensanchar la pantalla de caja.
    <article className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-4 min-w-0 [overflow-wrap:anywhere]">
      <div className="flex items-center gap-2">
        <h3 className="font-bold">
          {ICONO_SERVICIO[s.tipo]} {s.tipo === "domicilio" ? "Domicilio" : "Para llevar"} por el link
        </h3>
        <span className="ml-auto text-xs opacity-60">{haceCuanto(s.creadoEn, ahora)}</span>
      </div>
      <p className="text-sm mt-1.5">
        👤 <b>{s.clienteNombre}</b> ·{" "}
        <a href={`tel:${s.clienteTelefono}`} className="underline">
          📞 {s.clienteTelefono}
        </a>
      </p>
      {s.direccion && <p className="text-sm opacity-80 mt-0.5">📍 {s.direccion}</p>}
      {(s.pago || s.notas) && (
        <p className="text-xs bg-amber-100 text-amber-900 rounded-lg px-2 py-1 mt-1.5">
          {s.pago && (
            <>
              💳 {ETIQUETA_PAGO[s.pago] ?? s.pago}
              {s.pagaCon ? ` (paga con ${formatoCOP(s.pagaCon)})` : ""}
            </>
          )}
          {s.pago && s.notas && " · "}
          {s.notas && <>📝 {s.notas}</>}
        </p>
      )}

      <ul className="mt-2 space-y-0.5 text-sm">
        {s.platos.map((p, i) => (
          <li key={i}>
            {p.cantidad}× {p.nombre}
            {p.ingredientesRemovidos.length > 0 && <span className="text-xs text-red-700"> (sin {p.ingredientesRemovidos.map((x) => x.nombre).join(", ")})</span>}
            {p.adicionales.length > 0 && <span className="text-xs opacity-60"> (+ {p.adicionales.map((x) => x.nombre).join(", ")})</span>}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-orange-200 text-sm">
        {s.tipo === "domicilio" ? (
          <label className="flex items-center gap-1.5 text-xs">
            Domicilio $
            <input type="number" min={0} step={500} value={costo} onChange={(e) => setCosto(e.target.value)} className="w-20 border border-orange-300 rounded-lg px-2 py-1 text-sm bg-white text-right" />
          </label>
        ) : (
          <span className="opacity-60 text-xs">Para recoger en el local</span>
        )}
        <span className="font-bold">{formatoCOP(totalAhora)}</span>
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={() => responder("aceptar")} disabled={ocupada} className="flex-1 text-white text-sm font-semibold rounded-full px-3 py-2 disabled:opacity-40" style={{ background: "var(--color-primario)" }}>
          Aceptar y enviar a cocina
        </button>
        <button onClick={() => responder("rechazar")} disabled={ocupada} className="text-sm font-semibold text-red-600 border border-red-300 rounded-full px-4 py-2 disabled:opacity-40">
          Rechazar
        </button>
      </div>
    </article>
  );
}

export function PedidosExternosTab({
  pedidos,
  solicitudes,
  hayTurno,
  onRecargar,
  onCobrar,
  onCambio,
}: {
  pedidos: PedidoExterno[];
  solicitudes: SolicitudPendiente[];
  hayTurno: boolean;
  onRecargar: () => void;
  onCobrar: (cuentaId: string) => void;
  onCambio: (msg: string) => void;
}) {
  const [formulario, setFormulario] = useState<DatosForm | null>(null);
  const [nuevo, setNuevo] = useState<DatosForm | null>(null);
  const [agregarA, setAgregarA] = useState<PedidoExterno | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  function cambiar<K extends keyof DatosForm>(campo: K, valor: DatosForm[K]) {
    setFormulario((f) => (f ? { ...f, [campo]: valor } : f));
  }

  function continuarAlMenu() {
    if (!formulario) return;
    if (!formulario.clienteNombre.trim()) {
      onCambio("Falta el nombre del cliente");
      return;
    }
    if (formulario.tipo === "domicilio" && !formulario.direccion.trim()) {
      onCambio("Falta la dirección del domicilio");
      return;
    }
    if (formulario.costoDomicilio.trim() !== "" && !(Number(formulario.costoDomicilio) >= 0)) {
      onCambio("El valor del domicilio no es válido");
      return;
    }
    setNuevo(formulario);
    setFormulario(null);
  }

  async function accion(p: PedidoExterno, ruta: "despachar" | "entregar" | "anular", exito: string) {
    setOcupado(p.id);
    try {
      const res = await fetch(`/api/pedidos-externos/${p.id}/${ruta}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onCambio(data.error ?? "No se pudo completar la acción");
      } else {
        onCambio(exito);
      }
      onRecargar();
    } finally {
      setOcupado(null);
    }
  }

  function anular(p: PedidoExterno) {
    if (!window.confirm(`¿Anular ${p.etiqueta} de ${p.clienteNombre ?? "el cliente"}? Se devuelve al inventario lo que cocina aún no había empezado.`)) return;
    accion(p, "anular", `${p.etiqueta} anulado`);
  }

  const porEstado = (e: EstadoEntrega) => pedidos.filter((p) => p.estadoEntrega === e).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFormulario(formVacio("llevar"))} className="text-sm font-semibold text-white rounded-full px-4 py-2" style={{ background: "var(--color-primario)" }}>
          🥡 + Para llevar
        </button>
        <button onClick={() => setFormulario(formVacio("domicilio"))} className="text-sm font-semibold text-white rounded-full px-4 py-2" style={{ background: "var(--color-secundario)" }}>
          🛵 + Domicilio
        </button>
        <div className="ml-auto flex flex-wrap gap-1.5 text-xs">
          {(["en_cocina", "listo", "en_camino"] as const).map((e) => (
            <span key={e} className={`rounded-full px-2.5 py-1 font-medium ${CLASE_ENTREGA[e]}`}>
              {ETIQUETA_ENTREGA[e]}: {porEstado(e)}
            </span>
          ))}
        </div>
      </div>

      {solicitudes.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold text-orange-700">🔔 Pedidos por confirmar ({solicitudes.length})</h2>
          <p className="text-xs opacity-60 -mt-2">Los mandaron los clientes desde el link. No llegan a cocina hasta que los aceptes; si nadie los atiende en 3 horas se cancelan solos.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {solicitudes.map((s) => (
              <TarjetaSolicitud key={s.id} s={s} ahora={ahora} onCambio={onCambio} onRecargar={onRecargar} />
            ))}
          </div>
        </section>
      )}

      {pedidos.length === 0 && solicitudes.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm opacity-60">
          No hay pedidos para llevar ni domicilios en marcha. Usa los botones de arriba para sacar uno.
        </div>
      )}

      {solicitudes.length > 0 && pedidos.length > 0 && <h2 className="font-bold pt-1">En marcha ({pedidos.length})</h2>}

      <div className="grid gap-3 md:grid-cols-2">
        {pedidos.map((p) => {
          const abierta = p.estadoCuenta === "abierta" || p.estadoCuenta === "dividida";
          const pagado = p.total > 0 && p.totalPagado >= p.total;
          const faltan = p.total - p.totalPagado;
          const puedeAgregar = abierta && (p.estadoEntrega === "en_cocina" || p.estadoEntrega === "listo");
          const puedeAnular = abierta && p.totalPagado === 0 && (p.estadoEntrega === "en_cocina" || p.estadoEntrega === "listo") && !p.despachadoEn;
          const trabajando = ocupado === p.id;
          return (
            <article key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 min-w-0 [overflow-wrap:anywhere]">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-lg">
                  {ICONO_SERVICIO[p.tipo]} {p.etiqueta}
                </h3>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${CLASE_ENTREGA[p.estadoEntrega]}`}>{ETIQUETA_ENTREGA[p.estadoEntrega]}</span>
                <span className="ml-auto text-xs opacity-50">{haceCuanto(p.creadoEn, ahora)}</span>
              </div>

              <p className="text-sm mt-1.5">
                👤 <b>{p.clienteNombre}</b>
                {p.clienteTelefono && <span className="opacity-70"> · 📞 {p.clienteTelefono}</span>}
              </p>
              {p.direccion && <p className="text-sm opacity-80 mt-0.5">📍 {p.direccion}</p>}
              {p.domiciliario && <p className="text-xs opacity-60 mt-0.5">🛵 Domiciliario: {p.domiciliario}</p>}
              {p.notas && <p className="text-xs bg-amber-50 text-amber-900 rounded-lg px-2 py-1 mt-1.5">📝 {p.notas}</p>}

              <ul className="mt-2 space-y-0.5 text-sm">
                {p.platos.map((pl) => (
                  <li key={pl.id} className="flex items-center justify-between gap-2">
                    <span>
                      {pl.cantidad}× {pl.nombre}
                      {pl.adicionales.length > 0 && <span className="text-xs opacity-50"> (+ {pl.adicionales.join(", ")})</span>}
                    </span>
                    <span className="text-[11px] opacity-50">{pl.estado === "pendiente" ? "pendiente" : pl.estado === "en_preparacion" ? "preparando" : pl.estado}</span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 text-sm">
                <span className="opacity-60">
                  {p.costoDomicilio > 0 ? `Incluye domicilio ${formatoCOP(p.costoDomicilio)}` : "Total"}
                </span>
                <span className="font-bold">
                  {formatoCOP(p.total)}
                  <span className={`ml-2 text-xs font-semibold ${pagado ? "text-green-700" : p.totalPagado > 0 ? "text-amber-700" : "opacity-50"}`}>
                    {pagado ? "Pagado ✓" : p.totalPagado > 0 ? `Faltan ${formatoCOP(faltan)}` : "Por cobrar"}
                  </span>
                </span>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {!pagado && abierta && (
                  <button
                    onClick={() => (hayTurno ? onCobrar(p.id) : onCambio("Abre un turno de caja para poder cobrar"))}
                    className="text-xs font-semibold text-white rounded-full px-3 py-1.5"
                    style={{ background: "var(--color-primario)" }}
                  >
                    Cobrar
                  </button>
                )}
                {pagado && (
                  <button onClick={() => onCobrar(p.id)} className="text-xs font-semibold border border-gray-300 rounded-full px-3 py-1.5">
                    Ver cuenta
                  </button>
                )}
                {p.tipo === "domicilio" && p.estadoEntrega === "listo" && (
                  <button onClick={() => accion(p, "despachar", `${p.etiqueta} salió con el domiciliario 🛵`)} disabled={trabajando} className="text-xs font-semibold border-2 border-blue-500 text-blue-700 rounded-full px-3 py-1.5 disabled:opacity-40">
                    🛵 Salió
                  </button>
                )}
                {(p.estadoEntrega === "listo" || p.estadoEntrega === "en_camino") && (
                  <button onClick={() => accion(p, "entregar", `${p.etiqueta} entregado ✅`)} disabled={trabajando} className="text-xs font-semibold bg-green-600 text-white rounded-full px-3 py-1.5 disabled:opacity-40">
                    Entregado
                  </button>
                )}
                {puedeAgregar && (
                  <button onClick={() => setAgregarA(p)} className="text-xs font-semibold border border-gray-300 rounded-full px-3 py-1.5">
                    + Agregar platos
                  </button>
                )}
                {puedeAnular && (
                  <button onClick={() => anular(p)} disabled={trabajando} className="text-xs font-semibold text-red-600 rounded-full px-3 py-1.5 disabled:opacity-40 ml-auto">
                    Anular
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {formulario && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFormulario(null)} />
          <div className="absolute inset-x-0 bottom-0 sm:m-auto sm:relative sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">{formulario.tipo === "domicilio" ? "🛵 Nuevo domicilio" : "🥡 Nuevo pedido para llevar"}</h3>
            <p className="text-xs opacity-50 mt-0.5">Primero los datos del cliente; después eliges los platos del menú.</p>

            <label className="block text-xs font-medium opacity-70 mt-4 mb-1">Nombre del cliente *</label>
            <input value={formulario.clienteNombre} onChange={(e) => cambiar("clienteNombre", e.target.value)} placeholder="Ej. Juan Pérez" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" autoFocus />

            <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Teléfono</label>
            <input value={formulario.clienteTelefono} onChange={(e) => cambiar("clienteTelefono", e.target.value)} inputMode="tel" placeholder="300 123 4567" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />

            {formulario.tipo === "domicilio" && (
              <>
                <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Dirección *</label>
                <textarea value={formulario.direccion} onChange={(e) => cambiar("direccion", e.target.value)} rows={2} placeholder="Calle, número, barrio y referencia" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Valor del domicilio ($)</label>
                    <input type="number" min={0} step={500} value={formulario.costoDomicilio} onChange={(e) => cambiar("costoDomicilio", e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Domiciliario</label>
                    <input value={formulario.domiciliario} onChange={(e) => cambiar("domiciliario", e.target.value)} placeholder="Opcional" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
                  </div>
                </div>
              </>
            )}

            <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Notas</label>
            <input value={formulario.notas} onChange={(e) => cambiar("notas", e.target.value)} placeholder="Ej. paga con $100.000, tocar el timbre" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />

            <button onClick={continuarAlMenu} className="w-full text-white rounded-xl py-3 font-semibold mt-5" style={{ background: "var(--color-primario)" }}>
              Elegir platos →
            </button>
          </div>
        </div>
      )}

      {nuevo && (
        <PedidoMesero
          titulo={`${nuevo.tipo === "domicilio" ? "Domicilio" : "Para llevar"} — ${nuevo.clienteNombre.trim()}`}
          tituloCarrito={`Pedido — ${nuevo.clienteNombre.trim()}`}
          onCerrar={() => setNuevo(null)}
          onEnviar={async (items) => {
            const res = await fetch("/api/pedidos-externos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tipo: nuevo.tipo,
                clienteNombre: nuevo.clienteNombre,
                clienteTelefono: nuevo.clienteTelefono,
                direccion: nuevo.direccion,
                costoDomicilio: nuevo.costoDomicilio.trim() === "" ? 0 : Number(nuevo.costoDomicilio),
                domiciliario: nuevo.domiciliario,
                notas: nuevo.notas,
                items,
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return { error: data.error ?? "No se pudo enviar el pedido", codigo: data.codigo };
            return { mensaje: `${nuevo.tipo === "domicilio" ? "Domicilio" : "Para llevar"} #${data.numero} enviado a cocina 👨‍🍳` };
          }}
          onEnviado={(mensaje) => {
            setNuevo(null);
            onCambio(mensaje);
            onRecargar();
          }}
        />
      )}

      {agregarA && (
        <PedidoMesero
          titulo={`Agregar platos — ${agregarA.etiqueta}`}
          tituloCarrito={`Pedido — ${agregarA.etiqueta}`}
          onCerrar={() => setAgregarA(null)}
          onEnviar={async (items) => {
            const res = await fetch(`/api/pedidos-externos/${agregarA.id}/pedidos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return { error: data.error ?? "No se pudo agregar el pedido", codigo: data.codigo };
            return { mensaje: `Platos agregados a ${agregarA.etiqueta} 👨‍🍳` };
          }}
          onEnviado={(mensaje) => {
            setAgregarA(null);
            onCambio(mensaje);
            onRecargar();
          }}
        />
      )}
    </div>
  );
}
