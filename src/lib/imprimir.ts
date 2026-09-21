import { construirTicketHTML, datosDeCuenta, documentoImpresion, sanearConfigTicket, type ConfigTicket, type CuentaParaTicket, type NegocioTicket } from "@/lib/ticket";

// Impresion desde el navegador (solo se usa en pantallas del panel, con sesion abierta).

/**
 * Manda una pagina HTML al dialogo de impresion sin abrir ventanas nuevas (un iframe escondido):
 * no lo frenan los bloqueadores de ventanas emergentes y no deja pestañas abiertas.
 */
export function imprimirDocumento(documento: string): Promise<void> {
  return new Promise((resolve) => {
    const marco = document.createElement("iframe");
    marco.setAttribute("aria-hidden", "true");
    marco.style.cssText = "position:fixed;left:-9999px;top:0;width:80mm;height:100mm;border:0;visibility:hidden";
    document.body.appendChild(marco);

    const ventana = marco.contentWindow;
    const doc = marco.contentDocument;
    if (!ventana || !doc) {
      marco.remove();
      resolve();
      return;
    }
    doc.open();
    doc.write(documento);
    doc.close();

    const imprimir = () => {
      try {
        ventana.focus();
        ventana.print();
      } finally {
        // El dialogo ya se mostro: se retira el iframe un momento despues.
        setTimeout(() => {
          marco.remove();
          resolve();
        }, 1500);
      }
    };
    // Si hay logo, se espera a que cargue antes de imprimir.
    const cargando = [...doc.images].filter((img) => !img.complete);
    if (cargando.length === 0) setTimeout(imprimir, 50);
    else
      Promise.all(
        cargando.map(
          (img) =>
            new Promise<void>((listo) => {
              img.onload = img.onerror = () => listo();
            })
        )
      ).then(() => setTimeout(imprimir, 50));
  });
}

export async function cargarDisenoTicket(): Promise<{ config: ConfigTicket; negocio: NegocioTicket }> {
  const res = await fetch("/api/ticket-config", { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error ?? "No se pudo cargar el diseño del ticket");
  return { config: sanearConfigTicket(data.config), negocio: data.negocio };
}

/** Imprime el ticket de una cuenta: pre-cuenta si falta cobrar, ticket de venta si ya se pagó. */
export async function imprimirCuenta(cuentaId: string): Promise<void> {
  const [res, diseno] = await Promise.all([fetch(`/api/cuentas/${cuentaId}`, { cache: "no-store" }), cargarDisenoTicket()]);
  const cuenta = await res.json().catch(() => null);
  if (!res.ok || !cuenta) throw new Error(cuenta?.error ?? "No se pudo cargar la cuenta para imprimir");
  const datos = datosDeCuenta(cuenta as CuentaParaTicket);
  await imprimirDocumento(documentoImpresion(diseno.config, construirTicketHTML(diseno.config, diseno.negocio, datos), datos.servicio));
}
