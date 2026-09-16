/*
 * Canal de eventos EN VIVO entre pestañas para las plantillas estáticas de
 * restaurant-saas. Sustituye temporalmente al backend real (SSE +
 * Postgres LISTEN/NOTIFY, ver arquitectura-backend.md sec. 12): mismo
 * patrón pub/sub, corriendo enteramente en el navegador via
 * BroadcastChannel, para poder demostrar el flujo "el cliente hace algo
 * en su mesa -> el mesero/cocina lo ven al instante" sin backend todavía.
 *
 * Requisito: las páginas deben abrirse por http://localhost (usar el
 * launch config "restaurant-saas-preview"), no como archivo file://
 * -- BroadcastChannel exige mismo origen y file:// no lo garantiza de
 * forma confiable entre pestañas.
 */
const canalRestaurante = new BroadcastChannel('restaurante-la-gorda-demo');

function emitirEvento(tipo, payload) {
  canalRestaurante.postMessage({ tipo, payload, ts: Date.now() });
}

function suscribirseEvento(tipo, callback) {
  canalRestaurante.addEventListener('message', (e) => {
    if (e.data && e.data.tipo === tipo) callback(e.data.payload);
  });
}

function reproducirBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
  } catch (e) { /* audio no disponible (ej. sin gesto previo del usuario); no es crítico */ }
}
