"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PedidoMesero, type Categoria, type ProductoMenu } from "@/components/mesero/PedidoMesero";

// Link publico para pedir a domicilio o para recoger (/pedir/<slug>): el cliente elige del menu, deja sus
// datos y el pedido queda esperando que caja lo acepte. Despues ve en que va (seguimiento).

type Tema = { colorPrimario: string; colorSecundario: string; colorFondo: string; colorTexto: string; fuente: string };
type MenuPublico = {
  restaurante: { nombre: string; telefono: string | null };
  tema: Tema;
  abierto: boolean;
  costoDomicilio: number;
  categorias: Categoria[];
  productos: ProductoMenu[];
};
type Progreso = "pendiente" | "rechazada" | "en_cocina" | "listo" | "en_camino" | "entregado" | "cancelada";
type Seguimiento = {
  progreso: Progreso;
  motivoRechazo: string | null;
  tipo: "llevar" | "domicilio";
  clienteNombre: string;
  numero: number | null;
  total: number;
  restaurante: { nombre: string; telefono: string | null };
};
type Datos = { tipo: "llevar" | "domicilio"; nombre: string; telefono: string; direccion: string; pago: string; pagaCon: string; notas: string; website: string };

const DATOS_VACIOS: Datos = { tipo: "domicilio", nombre: "", telefono: "", direccion: "", pago: "efectivo", pagaCon: "", notas: "", website: "" };
const formatoCOP = (v: number) => "$" + v.toLocaleString("es-CO");
const clave = (slug: string) => `pedido-${slug}`;

function leerPedidoGuardado(slug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(clave(slug));
  } catch {
    return null;
  }
}
function guardarPedido(slug: string, id: string | null) {
  try {
    if (id) window.localStorage.setItem(clave(slug), id);
    else window.localStorage.removeItem(clave(slug));
  } catch {
    // sin almacenamiento: el seguimiento solo dura mientras la pagina siga abierta
  }
}

function estiloTema(t: Tema) {
  return { "--color-primario": t.colorPrimario, "--color-secundario": t.colorSecundario, "--color-fondo": t.colorFondo, "--color-texto": t.colorTexto, "--fuente": t.fuente, background: "var(--color-fondo)", color: "var(--color-texto)", fontFamily: "var(--fuente)" } as React.CSSProperties;
}

export function PedirDomicilio({ slug }: { slug: string }) {
  const [menu, setMenu] = useState<MenuPublico | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [datos, setDatos] = useState<Datos>(DATOS_VACIOS);
  const [seguimientoId, setSeguimientoId] = useState<string | null>(() => leerPedidoGuardado(slug));
  const idEnviado = useRef<string | null>(null);

  const cargar = useCallback(
    () =>
      fetch(`/api/public/pedir/${slug}`)
        .then(async (r) => {
          if (r.status === 404) return setNoExiste(true);
          setMenu(await r.json());
        })
        .catch(() => undefined),
    [slug]
  );
  useEffect(() => {
    cargar();
  }, [cargar]);

  if (noExiste) return <Mensaje titulo="Este enlace no es válido" texto="Revisa que el link esté completo o pídeselo de nuevo al restaurante." />;
  if (!menu) return <div className="min-h-screen grid place-items-center text-sm opacity-50">Cargando menú…</div>;

  const tema = estiloTema(menu.tema);
  const telefono = menu.restaurante.telefono;

  if (seguimientoId) {
    return (
      <div className="min-h-screen" style={tema}>
        <SeguimientoPedido
          id={seguimientoId}
          menu={menu}
          onNuevoPedido={() => {
            guardarPedido(slug, null);
            setSeguimientoId(null);
            setDatos((d) => ({ ...DATOS_VACIOS, nombre: d.nombre, telefono: d.telefono, direccion: d.direccion }));
          }}
        />
      </div>
    );
  }

  if (!menu.abierto) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center" style={tema}>
        <div>
          <p className="text-4xl">🍽️</p>
          <h1 className="text-xl font-semibold mt-3">{menu.restaurante.nombre}</h1>
          <p className="text-sm opacity-70 mt-2">Por ahora no estamos recibiendo pedidos por este link.</p>
          {telefono && (
            <a href={`tel:${telefono}`} className="inline-block mt-4 text-sm font-semibold underline" style={{ color: "var(--color-primario)" }}>
              Llámanos al {telefono}
            </a>
          )}
        </div>
      </div>
    );
  }

  const digitos = datos.telefono.replace(/\D/g, "").length;
  const valido = datos.nombre.trim().length >= 2 && digitos >= 7 && digitos <= 15 && (datos.tipo === "llevar" || datos.direccion.trim().length >= 5);

  return (
    <div style={tema}>
      <PedidoMesero
        titulo={`Pedir a ${menu.restaurante.nombre}`}
        tituloCarrito="Tu pedido"
        menu={{ categorias: menu.categorias, productos: menu.productos }}
        alAgotarse={cargar}
        datosEnvio={<FormularioCliente datos={datos} onCambio={(c) => setDatos((d) => ({ ...d, ...c }))} costoDomicilio={menu.costoDomicilio} />}
        puedeEnviar={valido}
        textoEnviar="Enviar pedido"
        cargoExtra={datos.tipo === "domicilio" && menu.costoDomicilio > 0 ? { etiqueta: "Domicilio", valor: menu.costoDomicilio } : null}
        onEnviar={async (items) => {
          const res = await fetch(`/api/public/pedir/${slug}/pedidos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tipo: datos.tipo,
              nombre: datos.nombre,
              telefono: datos.telefono,
              direccion: datos.direccion,
              notas: datos.notas,
              pago: datos.pago,
              pagaCon: datos.pago === "efectivo" && datos.pagaCon.replace(/\D/g, "") !== "" ? Number(datos.pagaCon.replace(/\D/g, "")) : undefined,
              website: datos.website,
              items,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return { error: data.error ?? "No se pudo enviar el pedido, intenta de nuevo", codigo: data.codigo };
          idEnviado.current = data.id ?? null;
          return { mensaje: "Pedido enviado" };
        }}
        onEnviado={() => {
          if (idEnviado.current) {
            guardarPedido(slug, idEnviado.current);
            setSeguimientoId(idEnviado.current);
          }
        }}
      />
    </div>
  );
}

function Mensaje({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-screen grid place-items-center px-6 text-center">
      <div>
        <h1 className="text-lg font-semibold">{titulo}</h1>
        <p className="text-sm opacity-60 mt-2">{texto}</p>
      </div>
    </div>
  );
}

function FormularioCliente({ datos, onCambio, costoDomicilio }: { datos: Datos; onCambio: (c: Partial<Datos>) => void; costoDomicilio: number }) {
  const entrada = "w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white";
  return (
    <div className="space-y-3 pt-3 border-t border-gray-100">
      <p className="text-xs font-semibold uppercase opacity-60">Tus datos</p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["domicilio", "🛵 A domicilio"],
            ["llevar", "🥡 Recoger en el local"],
          ] as const
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            onClick={() => onCambio({ tipo: valor })}
            className="rounded-xl border-2 py-2 text-sm font-semibold"
            style={datos.tipo === valor ? { borderColor: "var(--color-primario)", color: "var(--color-primario)", background: "color-mix(in srgb, var(--color-primario) 8%, transparent)" } : { borderColor: "#D1D5DB" }}
          >
            {etiqueta}
          </button>
        ))}
      </div>
      {datos.tipo === "domicilio" && costoDomicilio > 0 && <p className="text-xs opacity-60">El domicilio cuesta {formatoCOP(costoDomicilio)}.</p>}

      <input value={datos.nombre} onChange={(e) => onCambio({ nombre: e.target.value })} placeholder="Tu nombre *" autoComplete="name" maxLength={80} className={entrada} />
      <input value={datos.telefono} onChange={(e) => onCambio({ telefono: e.target.value })} placeholder="Tu teléfono / WhatsApp *" inputMode="tel" autoComplete="tel" maxLength={20} className={entrada} />
      {datos.tipo === "domicilio" && (
        <textarea value={datos.direccion} onChange={(e) => onCambio({ direccion: e.target.value })} rows={2} placeholder="Dirección de entrega * (calle, número, barrio, referencia)" maxLength={200} className={entrada} />
      )}

      <select value={datos.pago} onChange={(e) => onCambio({ pago: e.target.value })} className={entrada} aria-label="Cómo vas a pagar">
        <option value="efectivo">Pago en efectivo</option>
        <option value="transferencia">Pago por transferencia (Nequi, Daviplata…)</option>
        <option value="datafono">Pago con datáfono</option>
      </select>
      {datos.pago === "efectivo" && <input value={datos.pagaCon} onChange={(e) => onCambio({ pagaCon: e.target.value })} inputMode="numeric" placeholder="¿Con cuánto pagas? (opcional, para llevarte el cambio)" className={entrada} />}
      <input value={datos.notas} onChange={(e) => onCambio({ notas: e.target.value })} placeholder="Notas (opcional): sin picante, timbre dañado…" maxLength={300} className={entrada} />

      {/* Campo trampa para bots: las personas no lo ven ni lo llenan. */}
      <input name="website" value={datos.website} onChange={(e) => onCambio({ website: e.target.value })} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
    </div>
  );
}

const PASOS_DOMICILIO: { progreso: Progreso[]; texto: string }[] = [
  { progreso: ["pendiente"], texto: "Enviado — esperando confirmación" },
  { progreso: ["en_cocina"], texto: "Aceptado — lo estamos preparando" },
  { progreso: ["listo"], texto: "Listo — esperando al domiciliario" },
  { progreso: ["en_camino"], texto: "En camino a tu dirección" },
  { progreso: ["entregado"], texto: "Entregado — ¡buen provecho!" },
];
const PASOS_LLEVAR: { progreso: Progreso[]; texto: string }[] = [
  { progreso: ["pendiente"], texto: "Enviado — esperando confirmación" },
  { progreso: ["en_cocina"], texto: "Aceptado — lo estamos preparando" },
  { progreso: ["listo", "en_camino"], texto: "Listo para recoger en el local" },
  { progreso: ["entregado"], texto: "Entregado — ¡buen provecho!" },
];

function SeguimientoPedido({ id, menu, onNuevoPedido }: { id: string; menu: MenuPublico; onNuevoPedido: () => void }) {
  const [s, setS] = useState<Seguimiento | null>(null);
  const [sinConexion, setSinConexion] = useState(false);

  useEffect(() => {
    let activo = true;
    const consultar = () =>
      fetch(`/api/public/solicitudes/${id}`)
        .then(async (r) => {
          if (r.status === 404) return onNuevoPedido();
          if (!r.ok) throw new Error("error");
          const datos = (await r.json()) as Seguimiento;
          if (activo) {
            setS(datos);
            setSinConexion(false);
          }
        })
        .catch(() => activo && setSinConexion(true));
    consultar();
    const timer = setInterval(consultar, 10000);
    return () => {
      activo = false;
      clearInterval(timer);
    };
  }, [id, onNuevoPedido]);

  const telefono = s?.restaurante.telefono ?? menu.restaurante.telefono;
  const pasos = s?.tipo === "llevar" ? PASOS_LLEVAR : PASOS_DOMICILIO;
  const final = s ? ["rechazada", "cancelada", "entregado"].includes(s.progreso) : false;
  const pasoActual = s ? pasos.findIndex((p) => p.progreso.includes(s.progreso)) : -1;

  return (
    <div className="max-w-md mx-auto px-5 py-8">
      <p className="text-center text-4xl">{s?.progreso === "rechazada" || s?.progreso === "cancelada" ? "😕" : s?.progreso === "entregado" ? "🎉" : "🧾"}</p>
      <h1 className="text-xl font-semibold text-center mt-2 [overflow-wrap:anywhere]">{s ? `Pedido de ${s.clienteNombre}` : "Tu pedido"}</h1>
      <p className="text-sm text-center opacity-60">
        {menu.restaurante.nombre}
        {s?.numero ? ` · #${s.numero}` : ""}
      </p>

      {!s && <p className="text-center text-sm opacity-50 mt-8">Consultando tu pedido…</p>}

      {s && (s.progreso === "rechazada" || s.progreso === "cancelada") && (
        <div className="mt-6 bg-white rounded-2xl border border-black/5 shadow-sm p-5 text-center">
          <p className="font-semibold">{s.progreso === "rechazada" ? "El restaurante no pudo aceptar tu pedido" : "Tu pedido fue cancelado"}</p>
          {s.motivoRechazo && <p className="text-sm opacity-70 mt-1">&ldquo;{s.motivoRechazo}&rdquo;</p>}
          {telefono && <p className="text-sm opacity-70 mt-2">Puedes llamar al {telefono} para más información.</p>}
        </div>
      )}

      {s && s.progreso !== "rechazada" && s.progreso !== "cancelada" && (
        <ol className="mt-6 bg-white rounded-2xl border border-black/5 shadow-sm p-5 space-y-3">
          {pasos.map((p, i) => {
            const hecho = i < pasoActual || s.progreso === "entregado";
            const actual = i === pasoActual && s.progreso !== "entregado";
            return (
              <li key={p.texto} className={`flex items-center gap-3 text-sm ${hecho || actual ? "" : "opacity-40"}`}>
                <span
                  className="w-6 h-6 rounded-full grid place-items-center text-xs font-bold shrink-0 text-white"
                  style={{ background: hecho || actual ? "var(--color-primario)" : "#9CA3AF" }}
                >
                  {hecho ? "✓" : i + 1}
                </span>
                <span className={actual ? "font-semibold" : ""}>{p.texto}</span>
              </li>
            );
          })}
        </ol>
      )}

      {s && (
        <div className="flex justify-between font-semibold mt-4 px-1">
          <span>Total</span>
          <span>{formatoCOP(s.total)}</span>
        </div>
      )}
      {sinConexion && <p className="text-xs text-center text-amber-700 mt-3">Sin conexión: seguimos intentando…</p>}

      <div className="mt-8 space-y-2 text-center">
        {telefono && (
          <a href={`tel:${telefono}`} className="block text-sm font-semibold underline" style={{ color: "var(--color-primario)" }}>
            Llamar al restaurante
          </a>
        )}
        <button onClick={onNuevoPedido} className="w-full text-white rounded-xl py-3 font-semibold" style={{ background: "var(--color-primario)" }}>
          {final ? "Hacer otro pedido" : "Pedir algo más"}
        </button>
      </div>
    </div>
  );
}
