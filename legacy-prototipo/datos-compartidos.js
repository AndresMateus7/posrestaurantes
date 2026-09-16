/*
 * "Backend falso" compartido entre las 4 plantillas (menu-cliente, mesero,
 * cocina, admin) mientras no existe el backend real de
 * arquitectura-backend.md. Guarda el estado en localStorage (persiste al
 * recargar) y avisa a las demás pestañas por canal-tiempo-real.js cuando
 * algo cambia, para simular SSE + Postgres sin backend todavia.
 *
 * Cada función de acción (crearPedido, abrirMesa, ajustarStock, etc.)
 * reproduce la lógica de negocio descrita en arquitectura-backend.md para
 * el endpoint equivalente -- son el "Route Handler" de cada uno, corriendo
 * en el navegador. Cuando se conecte el backend real, estas funciones se
 * reemplazan por fetch() a esos endpoints; el resto de cada página
 * (render, event listeners) no debería tener que cambiar mucho.
 *
 * Requiere canal-tiempo-real.js cargado antes que este archivo, y que las
 * páginas se sirvan por http://localhost (ver restaurant-saas-preview en
 * .claude/launch.json) -- no como archivo file://.
 */

const CLAVE_DB = 'restaurante-la-gorda-db-v1';

const DB_INICIAL = {
  restaurante: { nombre: 'Restaurante La Gorda', rotaQr: false },
  tema: {
    colorPrimario: '#DC2626', colorSecundario: '#1F2937',
    colorFondo: '#F9FAFB', colorTexto: '#111827', fuente: "'Poppins', sans-serif",
    logoIniciales: 'LG',
  },
  plano: {
    // Ver schema.sql tabla `planos`: array de figuras del lienzo 2D.
    // tipo: mesa | barra | pared | caja | cocina | decoracion
    // forma (solo mesa/barra): cuadrada | redonda | rectangular
    layout: [
      { id: 'el-m1', tipo: 'mesa', forma: 'cuadrada', x: 60, y: 70, ancho: 70, alto: 70, rotacion: 0 },
      { id: 'el-m2', tipo: 'mesa', forma: 'redonda', x: 180, y: 70, ancho: 70, alto: 70, rotacion: 0 },
      { id: 'el-m3', tipo: 'mesa', forma: 'cuadrada', x: 300, y: 70, ancho: 70, alto: 70, rotacion: 0 },
      { id: 'el-m4', tipo: 'mesa', forma: 'redonda', x: 420, y: 70, ancho: 70, alto: 70, rotacion: 0 },
      { id: 'el-m5', tipo: 'mesa', forma: 'cuadrada', x: 60, y: 220, ancho: 70, alto: 70, rotacion: 0 },
      { id: 'el-m6', tipo: 'mesa', forma: 'cuadrada', x: 180, y: 220, ancho: 70, alto: 70, rotacion: 0 },
      { id: 'el-m7', tipo: 'mesa', forma: 'rectangular', x: 290, y: 220, ancho: 110, alto: 70, rotacion: 0 },
      { id: 'el-m8', tipo: 'mesa', forma: 'cuadrada', x: 420, y: 220, ancho: 70, alto: 70, rotacion: 0 },
      { id: 'el-barra', tipo: 'barra', forma: 'rectangular', x: 580, y: 60, ancho: 130, alto: 260, rotacion: 0 },
      { id: 'el-cocina', tipo: 'cocina', forma: 'rectangular', x: 580, y: 340, ancho: 130, alto: 100, rotacion: 0 },
      { id: 'el-caja', tipo: 'caja', forma: 'rectangular', x: 60, y: 340, ancho: 100, alto: 60, rotacion: 0 },
    ],
  },
  mesas: [
    { id: 'm1', elementoId: 'el-m1', numero: '1', capacidad: 4, estado: 'libre' },
    { id: 'm2', elementoId: 'el-m2', numero: '2', capacidad: 2, estado: 'ocupada' },
    { id: 'm3', elementoId: 'el-m3', numero: '3', capacidad: 6, estado: 'pedido_servido' },
    { id: 'm4', elementoId: 'el-m4', numero: '4', capacidad: 4, estado: 'cuenta_solicitada' },
    { id: 'm5', elementoId: 'el-m5', numero: '5', capacidad: 2, estado: 'libre' },
    { id: 'm6', elementoId: 'el-m6', numero: '6', capacidad: 8, estado: 'ocupada' },
    { id: 'm7', elementoId: 'el-m7', numero: '7', capacidad: 4, estado: 'reservada' },
    { id: 'm8', elementoId: 'el-m8', numero: '8', capacidad: 4, estado: 'libre' },
  ],
  categorias: [
    { id: 'cat-entradas', nombre: 'Entradas' },
    { id: 'cat-fuertes', nombre: 'Platos fuertes' },
    { id: 'cat-bebidas', nombre: 'Bebidas' },
    { id: 'cat-postres', nombre: 'Postres' },
  ],
  ingredientes: [
    { id: 'ing-platano', nombre: 'Plátano verde', unidad: 'g', stock: 4000, stockMin: 1000 },
    { id: 'ing-hogao', nombre: 'Hogao', unidad: 'g', stock: 3000, stockMin: 800 },
    { id: 'ing-suero', nombre: 'Suero costeño', unidad: 'g', stock: 400, stockMin: 500 },
    { id: 'ing-masa', nombre: 'Masa de maíz', unidad: 'g', stock: 2000, stockMin: 500 },
    { id: 'ing-carne', nombre: 'Carne guisada', unidad: 'g', stock: 1500, stockMin: 500 },
    { id: 'ing-cerveza', nombre: 'Cerveza artesanal 330ml', unidad: 'unidad', stock: 0, stockMin: 24 },
    { id: 'ing-limon', nombre: 'Limón', unidad: 'unidad', stock: 40, stockMin: 20 },
    { id: 'ing-queso', nombre: 'Queso costeño (adicional)', unidad: 'g', stock: 800, stockMin: 300 },
  ],
  adicionales: [
    { id: 'ad-queso', nombre: 'Extra queso', precio: 3000, ingredienteId: 'ing-queso', cantidadUsada: 40 },
    { id: 'ad-aji', nombre: 'Ají extra', precio: 1000, ingredienteId: null, cantidadUsada: null },
    { id: 'ad-chicharron', nombre: 'Chicharrón extra', precio: 5000, ingredienteId: null, cantidadUsada: null },
    { id: 'ad-papa', nombre: 'Porción extra de papas', precio: 6000, ingredienteId: null, cantidadUsada: null },
    { id: 'ad-chantilly', nombre: 'Chantilly extra', precio: 1500, ingredienteId: null, cantidadUsada: null },
  ],
  productos: [
    { id: 'p1', categoriaId: 'cat-entradas', nombre: 'Patacones con hogao', descripcion: 'Plátano verde frito, hogao criollo y suero costeño.', precio: 18000, emoji: '🍌', alergenos: ['Lácteos'], estacion: 'cocina_general', tiempoPrepMin: 12, disponibleManual: true,
      ingredientes: [{ ingredienteId: 'ing-platano', cantidadUsada: 150 }, { ingredienteId: 'ing-hogao', cantidadUsada: 80 }, { ingredienteId: 'ing-suero', cantidadUsada: 50 }],
      adicionales: ['ad-queso'] },
    { id: 'p2', categoriaId: 'cat-entradas', nombre: 'Empanadas (x3)', descripcion: 'Empanadas de carne con ají casero.', precio: 12000, emoji: '🥟', alergenos: ['Gluten'], estacion: 'cocina_general', tiempoPrepMin: 12, disponibleManual: true,
      ingredientes: [{ ingredienteId: 'ing-masa', cantidadUsada: 120 }, { ingredienteId: 'ing-carne', cantidadUsada: 90 }],
      adicionales: ['ad-aji'] },
    { id: 'p3', categoriaId: 'cat-fuertes', nombre: 'Bandeja Paisa', descripcion: 'Frijoles, arroz, carne molida, chicharrón, huevo, arepa y aguacate.', precio: 38000, emoji: '🍛', alergenos: ['Huevo'], estacion: 'parrilla', tiempoPrepMin: 20, disponibleManual: true,
      ingredientes: [], adicionales: ['ad-chicharron'] },
    { id: 'p4', categoriaId: 'cat-fuertes', nombre: 'Pechuga a la parrilla', descripcion: 'Con papas criollas y ensalada de la casa.', precio: 32000, emoji: '🍗', alergenos: [], estacion: 'parrilla', tiempoPrepMin: 18, disponibleManual: false,
      ingredientes: [], adicionales: ['ad-papa'] },
    { id: 'p5', categoriaId: 'cat-bebidas', nombre: 'Limonada de coco', descripcion: 'Con hielo y hierbabuena.', precio: 9000, emoji: '🥥', alergenos: [], estacion: 'bar', tiempoPrepMin: 4, disponibleManual: true,
      ingredientes: [{ ingredienteId: 'ing-limon', cantidadUsada: 2 }], adicionales: [] },
    { id: 'p6', categoriaId: 'cat-bebidas', nombre: 'Cerveza artesanal', descripcion: 'Botella 330ml.', precio: 11000, emoji: '🍺', alergenos: ['Gluten'], estacion: 'bar', tiempoPrepMin: 3, disponibleManual: true,
      ingredientes: [{ ingredienteId: 'ing-cerveza', cantidadUsada: 1 }], adicionales: [] },
    { id: 'p7', categoriaId: 'cat-postres', nombre: 'Flan de café', descripcion: 'Con crema chantilly.', precio: 10000, emoji: '🍮', alergenos: ['Lácteos', 'Huevo'], estacion: 'cocina_general', tiempoPrepMin: 10, disponibleManual: true,
      ingredientes: [], adicionales: ['ad-chantilly'] },
  ],
  pedidos: [],
  itemsPedido: [],
  llamados: [
    { id: 'll-seed-1', mesaNumero: '4', tipo: 'solicitar_cuenta', creadoEn: Date.now() - 2 * 60000 },
    { id: 'll-seed-2', mesaNumero: '6', tipo: 'llamar_mesero', creadoEn: Date.now() - 1 * 60000 },
  ],
};

// Pedidos ya en curso, sembrados para que mesero/cocina tengan algo que
// mostrar desde el primer momento (coherente con el estado de las mesas).
(function sembrarPedidosIniciales() {
  const seed = [
    { mesaNumero: '2', productoId: 'p1', cantidad: 2, estado: 'listo' },
    { mesaNumero: '2', productoId: 'p6', cantidad: 2, estado: 'entregado' },
    { mesaNumero: '3', productoId: 'p3', cantidad: 2, estado: 'entregado' },
    { mesaNumero: '3', productoId: 'p5', cantidad: 2, estado: 'entregado' },
    { mesaNumero: '4', productoId: 'p4', cantidad: 1, estado: 'entregado' },
    { mesaNumero: '4', productoId: 'p7', cantidad: 1, estado: 'entregado' },
    { mesaNumero: '6', productoId: 'p2', cantidad: 3, estado: 'en_preparacion' },
    { mesaNumero: '6', productoId: 'p3', cantidad: 4, estado: 'pendiente' },
  ];
  const porMesa = {};
  seed.forEach((s, idx) => {
    const producto = DB_INICIAL.productos.find((p) => p.id === s.productoId);
    if (!porMesa[s.mesaNumero]) {
      const pedidoId = 'ped-seed-' + s.mesaNumero;
      porMesa[s.mesaNumero] = pedidoId;
      DB_INICIAL.pedidos.push({ id: pedidoId, mesaNumero: s.mesaNumero, estado: 'en_preparacion', origen: 'mesero', creadoEn: Date.now() - 9 * 60000 });
    }
    DB_INICIAL.itemsPedido.push({
      id: 'item-seed-' + idx, pedidoId: porMesa[s.mesaNumero], mesaNumero: s.mesaNumero,
      productoId: producto.id, nombreProducto: producto.nombre, emoji: producto.emoji,
      cantidad: s.cantidad, precioUnitario: producto.precio, estacion: producto.estacion, tiempoPrepMin: producto.tiempoPrepMin,
      ingredientesRemovidos: [], adicionales: [], estado: s.estado,
      creadoEn: Date.now() - (2 + idx) * 60000, listoEn: (s.estado === 'listo' || s.estado === 'entregado') ? Date.now() - idx * 60000 : null,
    });
  });
})();

function cargarDB() {
  try {
    const crudo = localStorage.getItem(CLAVE_DB);
    if (crudo) return JSON.parse(crudo);
  } catch (e) { /* localStorage corrupto o bloqueado: seguimos con datos frescos */ }
  const fresca = JSON.parse(JSON.stringify(DB_INICIAL));
  localStorage.setItem(CLAVE_DB, JSON.stringify(fresca));
  return fresca;
}

function guardarDB(db) {
  localStorage.setItem(CLAVE_DB, JSON.stringify(db));
  emitirEvento('db-actualizada', {});
}

function reiniciarDB() {
  localStorage.removeItem(CLAVE_DB);
  return cargarDB();
}

// ---------------------------------------------------------------------
// Disponibilidad -- misma logica que la vista productos_disponibilidad
// ---------------------------------------------------------------------
function disponibleEfectivo(producto, db) {
  if (!producto.disponibleManual) return false;
  if (producto.ingredientes.length === 0) return true;
  return producto.ingredientes.every((pi) => {
    const ing = db.ingredientes.find((i) => i.id === pi.ingredienteId);
    return ing && ing.stock >= pi.cantidadUsada;
  });
}

// ---------------------------------------------------------------------
// Mesas / llamados
// ---------------------------------------------------------------------
function abrirMesa(db, numero) {
  const mesa = db.mesas.find((m) => m.numero === String(numero));
  if (mesa) mesa.estado = 'ocupada';
}

function crearLlamado(db, numero, tipo) {
  db.llamados.unshift({ id: 'll-' + Date.now(), mesaNumero: String(numero), tipo, creadoEn: Date.now() });
  if (tipo === 'solicitar_cuenta') {
    const mesa = db.mesas.find((m) => m.numero === String(numero));
    if (mesa) mesa.estado = 'cuenta_solicitada';
  }
}

function atenderLlamado(db, id) {
  db.llamados = db.llamados.filter((l) => l.id !== id);
}

// ---------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------
// items: [{ productoId, cantidad, ingredientesRemovidos: [id], adicionales: [id] }]
function crearPedido(db, { mesaNumero, items, origen }) {
  const numero = String(mesaNumero);
  const mesa = db.mesas.find((m) => m.numero === numero);
  if (!mesa) throw new Error('mesa_no_existe');
  if (!db.restaurante.rotaQr && mesa.estado === 'libre' && origen !== 'mesero') throw new Error('mesa_cerrada');

  const pedidoId = 'ped-' + Date.now();
  const itemsCreados = items.map((it, idx) => {
    const producto = db.productos.find((p) => p.id === it.productoId);
    if (!producto || !disponibleEfectivo(producto, db)) throw new Error('producto_agotado:' + (producto ? producto.nombre : it.productoId));

    const removidos = it.ingredientesRemovidos || [];
    producto.ingredientes.forEach((pi) => {
      if (!removidos.includes(pi.ingredienteId)) {
        const ing = db.ingredientes.find((i) => i.id === pi.ingredienteId);
        if (ing) ing.stock = Math.max(0, ing.stock - pi.cantidadUsada * it.cantidad);
      }
    });
    const adicionales = (it.adicionales || []).map((adId) => {
      const ad = db.adicionales.find((a) => a.id === adId);
      if (ad.ingredienteId) {
        const ing = db.ingredientes.find((i) => i.id === ad.ingredienteId);
        if (ing) ing.stock = Math.max(0, ing.stock - ad.cantidadUsada * it.cantidad);
      }
      return { adicionalId: ad.id, nombre: ad.nombre, cantidad: it.cantidad, precioUnitario: ad.precio };
    });

    return {
      id: pedidoId + '-i' + idx, pedidoId, mesaNumero: numero,
      productoId: producto.id, nombreProducto: producto.nombre, emoji: producto.emoji,
      cantidad: it.cantidad, precioUnitario: producto.precio, estacion: producto.estacion, tiempoPrepMin: producto.tiempoPrepMin,
      ingredientesRemovidos: removidos, adicionales,
      estado: 'pendiente', creadoEn: Date.now(), listoEn: null,
    };
  });

  db.itemsPedido.push(...itemsCreados);
  db.pedidos.push({ id: pedidoId, mesaNumero: numero, estado: 'recibido', origen: origen || 'qr_cliente', creadoEn: Date.now() });
  if (mesa.estado === 'libre') mesa.estado = 'ocupada';
  return pedidoId;
}

function actualizarEstadoItem(db, itemId, nuevoEstado) {
  const item = db.itemsPedido.find((i) => i.id === itemId);
  if (!item) return;
  item.estado = nuevoEstado;
  if (nuevoEstado === 'listo') item.listoEn = Date.now();
  // Solo actualiza el estado del PEDIDO (para que el mesero sepa que ya
  // puede pasar a recogerlo). El estado de la MESA solo lo toca
  // marcarPedidoEntregado -- si lo cambiáramos aquí, una mesa con varios
  // pedidos activos aparecería "servida" apenas el primero esté listo,
  // aunque el resto siga pendiente en cocina.
  const hermanos = db.itemsPedido.filter((i) => i.pedidoId === item.pedidoId);
  const pedido = db.pedidos.find((p) => p.id === item.pedidoId);
  if (pedido && hermanos.every((i) => i.estado === 'listo' || i.estado === 'entregado')) {
    pedido.estado = 'listo';
  }
}

function marcarPedidoEntregado(db, pedidoId) {
  db.itemsPedido.filter((i) => i.pedidoId === pedidoId).forEach((i) => { if (i.estado === 'listo') i.estado = 'entregado'; });
  const pedido = db.pedidos.find((p) => p.id === pedidoId);
  if (!pedido) return;
  pedido.estado = 'entregado';
  // La mesa solo pasa a "pedido_servido" cuando TODOS sus pedidos activos
  // ya se entregaron -- si queda otro pedido cocinandose, la mesa sigue
  // "ocupada" aunque este pedido puntual ya se haya llevado.
  const otrosPendientes = db.pedidos.some((p) => p.mesaNumero === pedido.mesaNumero && p.id !== pedidoId && p.estado !== 'entregado' && p.estado !== 'cancelado');
  const mesa = db.mesas.find((m) => m.numero === pedido.mesaNumero);
  if (mesa && !otrosPendientes) mesa.estado = 'pedido_servido';
}

// ---------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------
function ajustarStock(db, ingredienteId, delta) {
  const ing = db.ingredientes.find((i) => i.id === ingredienteId);
  if (ing) ing.stock = Math.max(0, ing.stock + delta);
}

function reabastecerIngrediente(db, ingredienteId) {
  const ing = db.ingredientes.find((i) => i.id === ingredienteId);
  if (ing) ing.stock = ing.stockMin * 2;
}

// ---------------------------------------------------------------------
// Tema / configuracion / plano
// ---------------------------------------------------------------------
function guardarTema(db, cambios) { Object.assign(db.tema, cambios); }
function setRotaQr(db, valor) { db.restaurante.rotaQr = valor; }

function guardarPlano(db, layout) {
  db.plano.layout = layout;
  layout.filter((f) => f.tipo === 'mesa').forEach((f) => {
    let mesa = db.mesas.find((m) => m.elementoId === f.id);
    if (!mesa) {
      db.mesas.push({ id: 'm-' + f.id, elementoId: f.id, numero: f.numero || String(db.mesas.length + 1), capacidad: f.capacidad || 4, estado: 'libre' });
    } else if (f.numero && f.numero !== mesa.numero) {
      mesa.numero = f.numero;
    }
  });
  db.mesas = db.mesas.filter((m) => layout.some((f) => f.id === m.elementoId));
}
