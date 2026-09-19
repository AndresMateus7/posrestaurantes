"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

type Ajustes = { nombre: string; slug: string; pedidosWebActivos: boolean; costoDomicilioBase: number; telefono: string | null };

const formatoCOP = (v: number) => "$" + Math.round(v).toLocaleString("es-CO");

// Link publico para que los clientes pidan a domicilio o para recoger. Todo pedido llega primero a Caja,
// que lo acepta (va a cocina) o lo rechaza: nada entra a cocina ni al inventario sin que caja lo vea.
export function LinkDomiciliosTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const [origen] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [costo, setCosto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    fetch("/api/restaurante")
      .then((r) => r.json())
      .then((r: Ajustes) => {
        setAjustes(r);
        setCosto(String(r.costoDomicilioBase ?? 0));
        setTelefono(r.telefono ?? "");
      });
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const enlace = ajustes && origen ? `${origen}/pedir/${ajustes.slug}` : "";

  useEffect(() => {
    if (!enlace) return;
    let cancelado = false;
    QRCode.toDataURL(enlace, { width: 320, margin: 1 }).then((url) => {
      if (!cancelado) setQr(url);
    });
    return () => {
      cancelado = true;
    };
  }, [enlace]);

  async function guardar(cambio: { pedidosWebActivos?: boolean; costoDomicilioBase?: number; telefono?: string | null }, mensaje: string) {
    setGuardando(true);
    try {
      const res = await fetch("/api/restaurante", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambio) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onCambio(data.error ?? "No se pudo guardar");
        return;
      }
      setAjustes((a) => (a ? { ...a, ...cambio } : a));
      onCambio(mensaje);
    } finally {
      setGuardando(false);
    }
  }

  function guardarCosto() {
    const valor = costo.trim() === "" ? 0 : Number(costo);
    if (!Number.isInteger(valor) || valor < 0 || valor > 1_000_000) {
      onCambio("El valor del domicilio debe ser un número entero entre 0 y 1.000.000");
      return;
    }
    guardar({ costoDomicilioBase: valor }, valor === 0 ? "Domicilio sin costo" : `Domicilio: ${formatoCOP(valor)}`);
  }

  function guardarTelefono() {
    const limpio = telefono.trim();
    if (limpio !== "" && !/^\+?[\d\s().-]{6,20}$/.test(limpio)) {
      onCambio("El teléfono solo puede llevar números, espacios, + y guiones (6 a 20 caracteres)");
      return;
    }
    guardar({ telefono: limpio === "" ? null : limpio }, limpio === "" ? "Teléfono borrado" : "Teléfono guardado");
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      onCambio("Enlace copiado");
    } catch {
      onCambio("No se pudo copiar: selecciona el enlace y cópialo a mano");
    }
  }

  function imprimirQr() {
    if (!qr || !ajustes) return;
    const ventana = window.open("", "_blank", "width=480,height=640");
    if (!ventana) return;
    // El nombre viene de la base de datos: se escapa antes de meterlo en el HTML de impresion.
    const nombre = ajustes.nombre.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    ventana.document.write(`
      <html>
        <head><title>Pedidos ${nombre}</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;text-align:center;">
          <h2 style="margin:0 0 4px">${nombre}</h2>
          <p style="margin:0 0 16px;font-size:18px;">Pide a domicilio o para recoger</p>
          <img src="${qr}" width="320" height="320" />
          <p style="font-size:13px;color:#555;margin-top:12px;">Escanea el código con la cámara de tu celular</p>
        </body>
      </html>
    `);
    ventana.document.close();
    setTimeout(() => {
      ventana.focus();
      ventana.print();
    }, 300);
  }

  if (!ajustes) return <p className="text-sm opacity-60">Cargando…</p>;

  const mensajeWhatsapp = `Pide a domicilio o para recoger en ${ajustes.nombre}: ${enlace}`;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">Recibir pedidos por el link</p>
          <p className="text-xs opacity-60 mt-0.5">
            {ajustes.pedidosWebActivos
              ? "Encendido: los clientes pueden pedir. Cada pedido le llega a Caja y solo pasa a cocina cuando Caja lo acepta."
              : "Apagado: quien abra el link verá que por ahora no se reciben pedidos."}
          </p>
        </div>
        <button
          onClick={() => guardar({ pedidosWebActivos: !ajustes.pedidosWebActivos }, ajustes.pedidosWebActivos ? "Link de pedidos apagado" : "Link de pedidos encendido")}
          disabled={guardando}
          role="switch"
          aria-checked={ajustes.pedidosWebActivos}
          aria-label="Recibir pedidos por el link"
          className="w-10 h-[22px] rounded-full relative transition shrink-0 disabled:opacity-50"
          style={{ background: ajustes.pedidosWebActivos ? "var(--color-primario)" : "#D1D5DB" }}
        >
          <span className="w-[18px] h-[18px] rounded-full bg-white absolute top-0.5 left-0 transition-transform" style={{ transform: ajustes.pedidosWebActivos ? "translateX(20px)" : "translateX(2px)" }} />
        </button>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <p className="font-medium">Valor del domicilio</p>
        <p className="text-xs opacity-60 mt-0.5">Se le suma al cliente cuando pide a domicilio. Caja lo puede cambiar al aceptar el pedido (por ejemplo, según la distancia). En 0 el domicilio no tiene costo.</p>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-sm">$</span>
          <input
            type="number"
            min={0}
            step={500}
            value={costo}
            onChange={(e) => setCosto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && guardarCosto()}
            className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            aria-label="Valor del domicilio"
          />
          <button
            onClick={guardarCosto}
            disabled={guardando || costo.trim() === String(ajustes.costoDomicilioBase)}
            className="text-sm font-semibold text-white rounded-full px-4 py-2 disabled:opacity-40"
            style={{ background: "var(--color-primario)" }}
          >
            Guardar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <p className="font-medium">Teléfono del restaurante</p>
        <p className="text-xs opacity-60 mt-0.5">Lo ve el cliente en el link para llamar si tiene un problema con su pedido. Déjalo vacío si no quieres mostrarlo.</p>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && guardarTelefono()}
            maxLength={20}
            placeholder="Ej: 300 123 4567"
            className="w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            aria-label="Teléfono del restaurante"
          />
          <button
            onClick={guardarTelefono}
            disabled={guardando || telefono.trim() === (ajustes.telefono ?? "")}
            className="text-sm font-semibold text-white rounded-full px-4 py-2 disabled:opacity-40"
            style={{ background: "var(--color-primario)" }}
          >
            Guardar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <p className="font-medium">Tu link de pedidos</p>
        <p className="text-xs opacity-60 mt-0.5">Compártelo por WhatsApp, Instagram o Facebook, o pon el código QR en el local, en los empaques y en las bolsas.</p>

        <div className="flex flex-col sm:flex-row gap-5 mt-4">
          <div className="flex-1 min-w-0">
            <div className="border border-gray-200 bg-gray-50 rounded-xl px-3 py-2.5 text-sm break-all select-all" data-testid="enlace-pedidos">
              {enlace}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={copiar} className="text-sm font-semibold text-white rounded-full px-4 py-2" style={{ background: "var(--color-primario)" }}>
                Copiar enlace
              </button>
              <a href={enlace} target="_blank" rel="noreferrer" className="text-sm font-semibold border border-gray-300 rounded-full px-4 py-2">
                Abrir
              </a>
              <a href={`https://wa.me/?text=${encodeURIComponent(mensajeWhatsapp)}`} target="_blank" rel="noreferrer" className="text-sm font-semibold border border-gray-300 rounded-full px-4 py-2">
                Enviar por WhatsApp
              </a>
            </div>
          </div>

          <div className="text-center shrink-0">
            {qr ? <img src={qr} alt="Código QR del link de pedidos" className="w-40 h-40 mx-auto rounded-xl border border-gray-200" /> : <div className="w-40 h-40 mx-auto rounded-xl bg-gray-100 animate-pulse" />}
            <div className="flex gap-2 justify-center mt-3">
              {qr && (
                <a href={qr} download="qr-pedidos.png" className="text-xs font-semibold border border-gray-300 rounded-full px-3 py-1.5">
                  Descargar PNG
                </a>
              )}
              <button onClick={imprimirQr} disabled={!qr} className="text-xs font-semibold border border-gray-300 rounded-full px-3 py-1.5 disabled:opacity-40">
                Imprimir
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm text-sm space-y-1.5">
        <p className="font-medium">Cómo funciona</p>
        <ol className="list-decimal pl-5 space-y-1 opacity-80">
          <li>El cliente abre el link, arma su pedido con el menú, escribe su nombre, teléfono y dirección, y lo envía.</li>
          <li>Caja recibe el aviso (con sonido) en &ldquo;Domicilios y para llevar&rdquo; y ve el pedido completo.</li>
          <li>Caja lo acepta —pasa a cocina— o lo rechaza con un motivo que el cliente alcanza a leer.</li>
          <li>El cliente ve en su pantalla en qué va: en cocina, listo, en camino o entregado. El pago es al recibir (efectivo, transferencia o datáfono).</li>
        </ol>
        <p className="text-xs opacity-60 pt-1">Los platos que estén agotados por falta de inventario no se pueden pedir por el link.</p>
      </div>
    </div>
  );
}
