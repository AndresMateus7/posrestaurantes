"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Interruptor } from "./Interruptor";
import { imprimirDocumento } from "@/lib/imprimir";
import { MAX_LOGO_TICKET, TICKET_DEFAULTS, construirTicketHTML, datosDeEjemplo, documentoImpresion, sanearConfigTicket, type ConfigTicket } from "@/lib/ticket";

// Diseno del ticket que se imprime en caja: mismo esquema del ticket del sistema del micromercado
// (logo, encabezado, que datos salen, pie de pagina) con vista previa en vivo.

type Negocio = { nit: string; direccion: string; telefono: string };
type Estado = { config: ConfigTicket; negocio: Negocio };

type ClaveSiNo = { [K in keyof ConfigTicket]: ConfigTicket[K] extends boolean ? K : never }[keyof ConfigTicket];

const OPCIONES_IMPRIMIR: { clave: ClaveSiNo; etiqueta: string; ayuda?: string }[] = [
  { clave: "showNombreNeg", etiqueta: "Nombre del restaurante" },
  { clave: "showNit", etiqueta: "NIT" },
  { clave: "showDir", etiqueta: "Dirección del restaurante" },
  { clave: "showTel", etiqueta: "Teléfono del restaurante" },
  { clave: "showFecha", etiqueta: "Fecha y hora" },
  { clave: "showRef", etiqueta: "Referencia de la cuenta" },
  { clave: "showMesero", etiqueta: "Mesero que atendió" },
  { clave: "showCajero", etiqueta: "Cajero que cobró" },
  { clave: "showCliente", etiqueta: "Nombre y teléfono del cliente", ayuda: "Domicilios y pedidos para llevar" },
  { clave: "showDomicilio", etiqueta: "Dirección de entrega", ayuda: "Domicilios" },
  { clave: "showPago", etiqueta: "Formas de pago y saldo pendiente" },
];

// La imagen se achica y se pinta sobre fondo blanco: el papel termico no imprime bien los PNG transparentes.
async function reducirLogo(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se pudo leer la imagen"));
      i.src = url;
    });
    const escala = Math.min(1, 320 / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * escala));
    canvas.height = Math.max(1, Math.round(img.height * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la imagen");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let salida = canvas.toDataURL("image/png");
    if (salida.length > MAX_LOGO_TICKET) salida = canvas.toDataURL("image/jpeg", 0.8);
    if (salida.length > MAX_LOGO_TICKET) throw new Error("La imagen pesa mucho: usa una más simple o más pequeña");
    return salida;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const campo = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";

export function TicketTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [guardado, setGuardado] = useState("");
  const [nombreRestaurante, setNombreRestaurante] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    fetch("/api/ticket-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const nuevo: Estado = {
          config: sanearConfigTicket(d.config),
          negocio: { nit: d.negocio.nit ?? "", direccion: d.negocio.direccion ?? "", telefono: d.negocio.telefono ?? "" },
        };
        setNombreRestaurante(d.negocio.nombre);
        setEstado(nuevo);
        setGuardado(JSON.stringify(nuevo));
      });
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const html = useMemo(() => {
    if (!estado) return "";
    const n = estado.negocio;
    return construirTicketHTML(estado.config, { nombre: nombreRestaurante, nit: n.nit || null, direccion: n.direccion || null, telefono: n.telefono || null }, datosDeEjemplo());
  }, [estado, nombreRestaurante]);

  if (!estado) return <p className="text-sm opacity-60">Cargando…</p>;

  const { config, negocio } = estado;
  const hayCambios = JSON.stringify(estado) !== guardado;

  const cambiarConfig = <K extends keyof ConfigTicket>(clave: K, valor: ConfigTicket[K]) => setEstado((e) => (e ? { ...e, config: { ...e.config, [clave]: valor } } : e));
  const cambiarNegocio = (clave: keyof Negocio, valor: string) => setEstado((e) => (e ? { ...e, negocio: { ...e.negocio, [clave]: valor } } : e));

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/ticket-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, negocio }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onCambio(data.error ?? "No se pudo guardar el diseño");
        return;
      }
      const nuevo: Estado = {
        config: sanearConfigTicket(data.config),
        negocio: { nit: data.negocio.nit ?? "", direccion: data.negocio.direccion ?? "", telefono: data.negocio.telefono ?? "" },
      };
      setEstado(nuevo);
      setGuardado(JSON.stringify(nuevo));
      onCambio("Diseño del ticket guardado ✅");
    } finally {
      setGuardando(false);
    }
  }

  async function subirLogo(archivo: File | undefined) {
    if (!archivo) return;
    try {
      cambiarConfig("logoImg", await reducirLogo(archivo));
    } catch (e) {
      onCambio(e instanceof Error ? e.message : "No se pudo cargar la imagen");
    }
  }

  function restablecer() {
    if (!window.confirm("¿Volver el diseño del ticket a los valores originales? (No se pierden los datos del negocio)")) return;
    setEstado((e) => (e ? { ...e, config: TICKET_DEFAULTS } : e));
  }

  async function imprimirPrueba() {
    const cuerpo = html;
    await imprimirDocumento(documentoImpresion(config, cuerpo, "Ticket de prueba"));
  }

  const anchoVista = config.ancho === "58mm" ? 220 : 290;

  return (
    <div className="grid lg:grid-cols-2 gap-5 items-start">
      <div className="space-y-4 min-w-0">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="font-medium">Logo o imagen</p>
          <p className="text-xs opacity-60 mt-0.5">Sale arriba del ticket. Se achica sola; funciona mejor una imagen simple en blanco y negro.</p>
          <div className="flex items-center gap-4 mt-3">
            <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 grid place-items-center overflow-hidden bg-gray-50 shrink-0">
              {config.logoImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={config.logoImg} alt="Logo del ticket" className="w-full h-full object-contain" />
              ) : (
                <span className="text-2xl">🍽️</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="text-sm font-semibold border border-gray-300 rounded-full px-4 py-2 cursor-pointer">
                Subir imagen
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    subirLogo(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {config.logoImg && (
                <button onClick={() => cambiarConfig("logoImg", "")} className="text-sm font-semibold text-red-600 border border-red-200 rounded-full px-4 py-2">
                  Quitar
                </button>
              )}
            </div>
          </div>
          <label className="block text-xs font-medium opacity-70 mt-4 mb-1">Texto del logo (si no hay imagen)</label>
          <textarea value={config.logoText} onChange={(e) => cambiarConfig("logoText", e.target.value)} rows={2} maxLength={300} placeholder="★ MI RESTAURANTE ★" className={`${campo} font-mono`} />
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="font-medium">Encabezado y texto</p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs font-medium opacity-70 mb-1">Ancho del papel</label>
              <select value={config.ancho} onChange={(e) => cambiarConfig("ancho", e.target.value === "58mm" ? "58mm" : "80mm")} className={campo}>
                <option value="58mm">58 mm (pequeño)</option>
                <option value="80mm">80 mm (estándar)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium opacity-70 mb-1">Tamaño de letra</label>
              <select value={config.fontSize} onChange={(e) => cambiarConfig("fontSize", sanearConfigTicket({ fontSize: e.target.value }).fontSize)} className={campo}>
                <option value="9px">Pequeña</option>
                <option value="11px">Normal</option>
                <option value="13px">Grande</option>
                <option value="15px">Muy grande</option>
              </select>
            </div>
          </div>
          <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Nombre en el ticket</label>
          <input value={config.nombre} onChange={(e) => cambiarConfig("nombre", e.target.value)} maxLength={60} placeholder={nombreRestaurante || "Nombre del restaurante"} className={campo} />
          <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Eslogan o subtítulo</label>
          <input value={config.slogan} onChange={(e) => cambiarConfig("slogan", e.target.value)} maxLength={80} placeholder="Comida casera con sabor" className={campo} />
          <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Línea separadora</label>
          <input value={config.sep} onChange={(e) => cambiarConfig("sep", e.target.value)} maxLength={48} className={`${campo} font-mono`} />
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="font-medium">Datos del negocio</p>
          <p className="text-xs opacity-60 mt-0.5">Salen debajo del nombre. Déjalos vacíos si no quieres imprimirlos.</p>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs font-medium opacity-70 mb-1">NIT</label>
              <input value={negocio.nit} onChange={(e) => cambiarNegocio("nit", e.target.value)} maxLength={30} placeholder="900.123.456-7" className={campo} />
            </div>
            <div>
              <label className="block text-xs font-medium opacity-70 mb-1">Teléfono</label>
              <input value={negocio.telefono} onChange={(e) => cambiarNegocio("telefono", e.target.value)} maxLength={20} inputMode="tel" placeholder="300 123 4567" className={campo} />
            </div>
          </div>
          <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Dirección</label>
          <input value={negocio.direccion} onChange={(e) => cambiarNegocio("direccion", e.target.value)} maxLength={120} placeholder="Calle 10 # 5-20, Barrio Centro" className={campo} />
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="font-medium">Pie de página</p>
          <p className="text-xs opacity-60 mt-0.5">Hasta 5 líneas al final del ticket. Deja vacía la que no quieras.</p>
          <div className="space-y-2 mt-3">
            {(["footer1", "footer2", "footer3", "footer4", "footer5"] as const).map((k, i) => (
              <input
                key={k}
                value={config[k]}
                onChange={(e) => cambiarConfig(k, e.target.value)}
                maxLength={80}
                placeholder={["¡Gracias por su visita!", "Vuelva pronto", "Horario: L-D 11am-9pm", "WhatsApp: 300 000 0000", "@mirestaurante"][i]}
                aria-label={`Línea ${i + 1} del pie de página`}
                className={campo}
              />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="font-medium">Qué se imprime</p>
          <div className="mt-2 divide-y divide-gray-100">
            {OPCIONES_IMPRIMIR.map((o) => (
              <div key={o.clave} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm">
                  {o.etiqueta}
                  {o.ayuda && <span className="block text-xs opacity-50">{o.ayuda}</span>}
                </span>
                <Interruptor activo={config[o.clave]} onCambio={(v) => cambiarConfig(o.clave, v)} etiqueta={o.etiqueta} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:sticky lg:top-4 space-y-3 min-w-0">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="font-medium">Vista previa</p>
          <p className="text-xs opacity-60 mt-0.5">Así se ve un ticket de venta (con datos de ejemplo). Cambia en vivo.</p>
          <div className="mt-4 overflow-x-auto">
            <div
              data-testid="vista-previa-ticket"
              className="bg-white text-black p-3 rounded border-2 border-dashed border-gray-300 mx-auto"
              style={{ width: anchoVista, fontSize: config.fontSize }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={guardar} disabled={!hayCambios || guardando} className="text-sm font-semibold text-white rounded-full px-5 py-2.5 disabled:opacity-40" style={{ background: "var(--color-primario)" }}>
            {guardando ? "Guardando…" : "Guardar diseño"}
          </button>
          <button onClick={imprimirPrueba} className="text-sm font-semibold border border-gray-300 rounded-full px-5 py-2.5">
            🖨️ Imprimir prueba
          </button>
          <button onClick={restablecer} className="text-sm font-semibold text-gray-500 rounded-full px-3 py-2.5">
            Restablecer
          </button>
        </div>
        {hayCambios && <p className="text-xs text-amber-700">Tienes cambios sin guardar.</p>}
        <p className="text-xs opacity-50">
          Los tickets se imprimen desde Caja (cuenta, cuentas cobradas y domicilios) y desde el Historial de ventas. Para papel térmico de rollo, elige la impresora del ticket y en &ldquo;Más ajustes&rdquo;
          márgenes en &ldquo;Ninguno&rdquo;.
        </p>
      </div>
    </div>
  );
}
