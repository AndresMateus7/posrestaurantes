// Ticket de impresion: diseno configurable (tomado del ticket del sistema del micromercado) y generador
// del HTML. Es logica pura (sirve en el navegador y en el servidor). Todo texto que viene de fuera
// (nombres, notas, direcciones de clientes...) se escapa antes de meterlo al HTML: el ticket se imprime
// desde una pagina con sesion abierta.

export type AnchoTicket = "58mm" | "80mm";
export type TamanoLetra = "9px" | "11px" | "13px" | "15px";

export type ConfigTicket = {
  ancho: AnchoTicket;
  fontSize: TamanoLetra;
  // Vacio = nombre del restaurante.
  nombre: string;
  slogan: string;
  // Texto o dibujo con caracteres (se usa si no hay imagen).
  logoText: string;
  // Imagen como data URL png/jpeg/webp, o "".
  logoImg: string;
  sep: string;
  footer1: string;
  footer2: string;
  footer3: string;
  footer4: string;
  footer5: string;
  showNombreNeg: boolean;
  showNit: boolean;
  showDir: boolean;
  showTel: boolean;
  showFecha: boolean;
  showRef: boolean;
  showCajero: boolean;
  showMesero: boolean;
  showCliente: boolean;
  showDomicilio: boolean;
  showPago: boolean;
};

export const TICKET_DEFAULTS: ConfigTicket = {
  ancho: "80mm",
  fontSize: "11px",
  nombre: "",
  slogan: "",
  logoText: "",
  logoImg: "",
  sep: "--------------------------------",
  footer1: "¡Gracias por su visita!",
  footer2: "Vuelva pronto",
  footer3: "",
  footer4: "",
  footer5: "",
  showNombreNeg: true,
  showNit: true,
  showDir: true,
  showTel: true,
  showFecha: true,
  showRef: true,
  showCajero: false,
  showMesero: true,
  showCliente: true,
  showDomicilio: true,
  showPago: true,
};

export const MAX_LOGO_TICKET = 160_000;
const LOGO_VALIDO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const TAMANOS: TamanoLetra[] = ["9px", "11px", "13px", "15px"];

/** Una imagen pequeña en data URL (png, jpeg o webp); "" (sin logo) tambien vale. */
export const esLogoValido = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_LOGO_TICKET && (v === "" || LOGO_VALIDO.test(v));

/**
 * Convierte lo que llegue (del cliente o de la base) en una configuracion valida: cada campo con su
 * tipo y largo maximo, y los que faltan con el valor por defecto. Un logo que no sea una imagen
 * pequena en data URL se descarta.
 */
export function sanearConfigTicket(entrada: unknown): ConfigTicket {
  const e = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const d = TICKET_DEFAULTS;
  const linea = (clave: keyof ConfigTicket, max: number) => {
    const v = e[clave];
    return typeof v === "string" ? v.replace(/[\r\n]+/g, " ").slice(0, max) : (d[clave] as string);
  };
  const si = (clave: keyof ConfigTicket) => (typeof e[clave] === "boolean" ? (e[clave] as boolean) : (d[clave] as boolean));
  const logo = esLogoValido(e.logoImg) ? e.logoImg : d.logoImg;

  return {
    ancho: e.ancho === "58mm" ? "58mm" : "80mm",
    fontSize: TAMANOS.includes(e.fontSize as TamanoLetra) ? (e.fontSize as TamanoLetra) : d.fontSize,
    nombre: linea("nombre", 60),
    slogan: linea("slogan", 80),
    logoText: typeof e.logoText === "string" ? e.logoText.replace(/\r/g, "").slice(0, 300) : d.logoText,
    logoImg: logo,
    sep: linea("sep", 48),
    footer1: linea("footer1", 80),
    footer2: linea("footer2", 80),
    footer3: linea("footer3", 80),
    footer4: linea("footer4", 80),
    footer5: linea("footer5", 80),
    showNombreNeg: si("showNombreNeg"),
    showNit: si("showNit"),
    showDir: si("showDir"),
    showTel: si("showTel"),
    showFecha: si("showFecha"),
    showRef: si("showRef"),
    showCajero: si("showCajero"),
    showMesero: si("showMesero"),
    showCliente: si("showCliente"),
    showDomicilio: si("showDomicilio"),
    showPago: si("showPago"),
  };
}

export type NegocioTicket = { nombre: string; nit?: string | null; direccion?: string | null; telefono?: string | null };

export type LineaTicket = { nombre: string; cantidad: number; total: number; extras?: string[] };
export type PagoTicket = { metodo: string; monto: number };

export type DatosTicket = {
  // "TICKET DE VENTA", "PRE-CUENTA", "PEDIDO A DOMICILIO"...
  titulo: string;
  aviso?: string;
  // "Mesa 4", "Domicilio #12 · Juan"...
  servicio: string;
  referencia?: string;
  fecha: string | Date;
  mesero?: string | null;
  cajero?: string | null;
  cliente?: { nombre?: string | null; telefono?: string | null; direccion?: string | null; notas?: string | null } | null;
  lineas: LineaTicket[];
  subtotal: number;
  propina: number;
  costoDomicilio: number;
  total: number;
  pagos: PagoTicket[];
  pagado: number;
};

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta_credito: "Tarjeta crédito",
  tarjeta_debito: "Tarjeta débito",
  nequi: "Nequi",
  daviplata: "Daviplata",
  transferencia: "Transferencia",
};

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const formatoFecha = (f: string | Date) =>
  new Date(f).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });

/** Cuerpo del ticket (sin <html>): sirve para la vista previa y para imprimir. */
export function construirTicketHTML(c: ConfigTicket, negocio: NegocioTicket, d: DatosTicket): string {
  const fs = c.fontSize;
  const grande = `${parseInt(fs) + 3}px`;
  const sep = `<div style="overflow:hidden;white-space:nowrap">${esc(c.sep)}</div>`;
  const centro = (t: string, estilo = "") => `<div style="text-align:center;overflow-wrap:anywhere;${estilo}">${t}</div>`;
  const fila = (izq: string, der: string, estilo = "") =>
    `<div style="display:flex;justify-content:space-between;gap:6px;${estilo}"><span style="min-width:0;overflow-wrap:anywhere">${izq}</span><span style="white-space:nowrap">${der}</span></div>`;
  const texto = (t: string, estilo = "") => `<div style="overflow-wrap:anywhere;${estilo}">${t}</div>`;

  let h = `<div style="font-family:monospace;font-size:${fs};line-height:1.5;color:#111;text-align:left">`;

  if (c.logoImg) h += centro(`<img src="${esc(c.logoImg)}" alt="" style="max-width:100%;max-height:60px;object-fit:contain">`, "margin-bottom:6px");
  else if (c.logoText) h += `<div style="text-align:center;font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere">${esc(c.logoText)}</div>`;

  const nombre = c.nombre.trim() || negocio.nombre;
  if (c.showNombreNeg) h += centro(esc(nombre), `font-weight:700;font-size:${grande}`);
  if (c.slogan) h += centro(esc(c.slogan));
  if (c.showNit && negocio.nit) h += centro(`NIT: ${esc(negocio.nit)}`);
  if (c.showDir && negocio.direccion) h += centro(esc(negocio.direccion));
  if (c.showTel && negocio.telefono) h += centro(`Tel: ${esc(negocio.telefono)}`);
  h += sep;

  h += centro(esc(d.titulo), "font-weight:700");
  if (d.aviso) h += centro(esc(d.aviso), "font-size:smaller");
  h += texto(esc(d.servicio), "font-weight:700");
  if (c.showFecha) h += texto(`Fecha: ${esc(formatoFecha(d.fecha))}`);
  if (c.showRef && d.referencia) h += texto(`Ref: ${esc(d.referencia)}`);
  if (c.showMesero && d.mesero) h += texto(`Atendió: ${esc(d.mesero)}`);
  if (c.showCajero && d.cajero) h += texto(`Cajero: ${esc(d.cajero)}`);
  if (d.cliente) {
    if (c.showCliente && d.cliente.nombre) h += texto(`Cliente: ${esc(d.cliente.nombre)}`);
    if (c.showCliente && d.cliente.telefono) h += texto(`Tel. cliente: ${esc(d.cliente.telefono)}`);
    if (c.showDomicilio && d.cliente.direccion) h += texto(`Dirección: ${esc(d.cliente.direccion)}`);
    // Lo que el cliente dijo del pedido (paga con..., timbre dañado...): lo necesita quien entrega.
    if (d.cliente.notas) h += texto(`Nota: ${esc(d.cliente.notas)}`);
  }
  h += sep;

  for (const l of d.lineas) {
    h += fila(`${esc(l.cantidad)}x ${esc(l.nombre)}`, cop(l.total));
    for (const extra of l.extras ?? []) h += texto(`+ ${esc(extra)}`, "padding-left:12px;font-size:smaller");
  }
  h += sep;

  if (d.propina > 0 || d.costoDomicilio > 0) h += fila("Subtotal", cop(d.subtotal));
  if (d.costoDomicilio > 0) h += fila("Domicilio", cop(d.costoDomicilio));
  if (d.propina > 0) h += fila("Propina", cop(d.propina));
  h += fila("TOTAL", cop(d.total), `font-weight:700;font-size:${grande}`);

  if (c.showPago) {
    for (const p of d.pagos) h += fila(`Pago ${esc(ETIQUETA_METODO[p.metodo] ?? p.metodo)}`, cop(p.monto));
    if (d.pagado < d.total) h += fila("Saldo pendiente", cop(d.total - d.pagado), "font-weight:700");
  }
  h += sep;

  for (const pie of [c.footer1, c.footer2, c.footer3, c.footer4, c.footer5]) {
    if (pie.trim()) h += centro(esc(pie));
  }
  return h + "</div>";
}

/** Pagina completa para imprimir: papel angosto de rollo (58 u 80 mm), como el ticket del micromercado. */
export function documentoImpresion(c: ConfigTicket, cuerpo: string, titulo = "Ticket"): string {
  const util = c.ancho === "58mm" ? "52mm" : "72mm";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
@page{size:${c.ancho} auto;margin:3mm}
html,body{margin:0;padding:0;background:#fff}
body{font-family:monospace;width:${util};margin:0;font-size:${c.fontSize};line-height:1.5}
div{word-break:break-word}img{max-width:100%}
</style></head><body>${cuerpo}</body></html>`;
}

/** Lo que devuelve GET /api/cuentas/[id] y necesita el ticket. */
export type CuentaParaTicket = {
  id: string;
  tipo: "mesa" | "llevar" | "domicilio";
  etiqueta: string;
  cliente: { nombre: string | null; telefono: string | null; direccion: string | null; notas: string | null } | null;
  meseroNombre: string | null;
  estado: string;
  subtotal: number;
  propina: number;
  costoDomicilio: number;
  total: number;
  cerradoEn?: string | null;
  cajero?: string | null;
  items: { nombreProducto: string; cantidad: number; precioUnitario: number; adicionales: { nombre: string; precioUnitario: number; cantidad: number }[] }[];
  pagos: { metodo: string; monto: number }[];
  totalPagado: number;
};

export function datosDeCuenta(c: CuentaParaTicket): DatosTicket {
  const pagada = c.estado === "pagada" || (c.total > 0 && c.totalPagado >= c.total);
  const titulo = pagada ? "TICKET DE VENTA" : c.tipo === "domicilio" ? "PEDIDO A DOMICILIO" : c.tipo === "llevar" ? "PEDIDO PARA LLEVAR" : "PRE-CUENTA";
  return {
    titulo,
    aviso: !pagada && c.tipo === "mesa" ? "No es comprobante de pago" : undefined,
    servicio: c.etiqueta,
    referencia: c.id.slice(0, 6).toUpperCase(),
    fecha: c.cerradoEn ?? new Date(),
    mesero: c.tipo === "mesa" ? c.meseroNombre : null,
    cajero: c.cajero ?? null,
    cliente: c.cliente,
    lineas: c.items.map((it) => ({
      nombre: it.nombreProducto,
      cantidad: it.cantidad,
      total: it.precioUnitario * it.cantidad + it.adicionales.reduce((a, ad) => a + ad.precioUnitario * ad.cantidad, 0),
      extras: it.adicionales.map((ad) => ad.nombre),
    })),
    subtotal: c.subtotal,
    propina: c.propina,
    costoDomicilio: c.costoDomicilio,
    total: c.total,
    pagos: c.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
    pagado: c.totalPagado,
  };
}

/** Ticket de ejemplo para la vista previa del diseno. */
export function datosDeEjemplo(): DatosTicket {
  return {
    titulo: "TICKET DE VENTA",
    servicio: "Mesa 4",
    referencia: "A1B2C3",
    fecha: new Date(),
    mesero: "Camila",
    cajero: "Ana",
    cliente: null,
    lineas: [
      { nombre: "Bandeja Paisa", cantidad: 2, total: 86000, extras: ["Chicharrón extra"] },
      { nombre: "Limonada de coco", cantidad: 2, total: 18000 },
      { nombre: "Flan de café", cantidad: 1, total: 10000 },
    ],
    subtotal: 114000,
    propina: 11400,
    costoDomicilio: 0,
    total: 125400,
    pagos: [{ metodo: "efectivo", monto: 125400 }],
    pagado: 125400,
  };
}
