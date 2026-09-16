# Arquitectura de Backend — SaaS de Restaurantes en Tiempo Real

Complementa [`schema.sql`](./schema.sql). Pensado como API REST/JSON sobre
Next.js App Router (Route Handlers), reutilizando el stack que ya existe en
este repo (Prisma 7 + adaptador Neon, NextAuth) — pero cualquier backend
Node/PHP puede implementar el mismo contrato.

## 1. Principios generales

- **Multi-tenant por `restaurante_id`.** Todo request autenticado resuelve
  un `restaurante_id` (desde la sesión del usuario) y lo aplica como filtro
  obligatorio en cada query. Los endpoints públicos (menú QR) resuelven el
  tenant a partir del `qr_token` de la mesa, nunca de un parámetro que el
  cliente pueda manipular libremente.
- **Roles:** `admin`, `mesero`, `cocina`, `caja` (tabla `usuarios.rol`).
  Cada grupo de endpoints abajo indica qué rol mínimo requiere.
- **Precios como snapshot.** Ningún endpoint recalcula precios de
  `items_pedido` a partir del catálogo vigente; se leen tal como quedaron
  guardados al crear el pedido (ver `schema.sql`, sección 6).
- **Disponibilidad = manual AND stock.** Ningún endpoint lee `productos.disponible`
  solo; siempre se consulta la vista `productos_disponibilidad` (o se
  replica su lógica), porque un producto puede estar habilitado a mano pero
  sin ingredientes suficientes (ver sección 7).
- **Tiempo real:** ver sección 10. Resumen: Server-Sent Events (SSE) para
  todo lo que es "un panel mirando una lista que cambia" (KDS, mesero,
  caja), no WebSockets bidireccionales — ningún cliente necesita enviar
  datos por ese canal, solo recibir.

## 2. Autenticación

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | público | Login de staff (NextAuth credentials) |
| POST | `/api/auth/logout` | staff | Cierra sesión |
| GET | `/api/auth/session` | staff | Usuario + restaurante_id + rol actuales |

Los endpoints **públicos** (sección 5) no usan sesión: se autorizan solo con
el `qr_token` de la mesa, que actúa como capability token de un solo
propósito (ver notas de seguridad, sección 11).

## 3. Branding / Tema (Requerimiento A)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/tema` | staff (cualquiera) | Config de tema del restaurante actual |
| PUT | `/api/tema` | admin | Actualiza logo, colores, fuente |
| GET | `/api/public/menu/:qrToken/tema` | público | Tema para pintar el menú del cliente antes de renderizar |

`PUT /api/tema` es el único endpoint de escritura de este módulo — el resto
del sistema solo lee `configuracion_tema` para aplicar las variables CSS
(ver `menu-cliente.html`).

## 4. Editor de plano 2D

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/planos/:planoId` | staff | Devuelve `layout` (JSON) completo |
| PUT | `/api/planos/:planoId` | admin | Reemplaza `layout` completo (guardado del canvas) |
| GET | `/api/mesas` | staff | Lista mesas + estado operativo actual |
| POST | `/api/mesas` | admin | Crea el registro operativo de una mesa nueva (tras dibujarla en el canvas), enlazando `elemento_id` |
| PATCH | `/api/mesas/:mesaId` | staff | Cambia `estado`, `mesero_id`, `capacidad`, etc. |
| POST | `/api/mesas/:mesaId/abrir` | mesero | Abre la mesa manualmente: `estado → 'ocupada'`, crea `cuenta` si no hay una abierta, `mesero_id = quien la abre` |
| DELETE | `/api/mesas/:mesaId` | admin | Elimina una mesa (solo si no tiene cuentas abiertas) |
| PATCH | `/api/restaurante` | admin | Config operativa general, hoy solo `{ rotaQr: boolean }` |

**Flujo de guardado del canvas:** el editor visual mantiene el estado
completo en el cliente (librería tipo Konva/Fabric) y hace `PUT` del array
entero en cada guardado explícito o autosave — no hay endpoints por-figura
para paredes/barra/decoración porque no son entidades operativas. Cuando el
usuario marca una figura como "mesa" y le asigna número/capacidad, el
editor dispara además un `POST /api/mesas` (o `PATCH` si ya existía) para
crear/actualizar su fila operativa.

**Rotación de QR vs. apertura manual (`restaurantes.rota_qr`):** es un
toggle de configuración, no dos sistemas distintos — ambos casos usan la
misma tabla `mesas`, solo cambia quién dispara `estado: 'libre' → 'ocupada'`:

- `rota_qr = true`: el primer `POST /api/public/pedidos` válido sobre una
  mesa `libre` la abre automáticamente (self-service). Al cerrarse la
  cuenta (`POST /api/cuentas/:id/cerrar`), `mesas.qr_token` se regenera, así
  que una foto vieja del QR deja de servir.
- `rota_qr = false`: el QR es fijo (se imprime una sola vez). Por eso
  `POST /api/public/pedidos` **rechaza** el pedido con un mensaje claro si
  `mesa.estado === 'libre'` — un mesero tiene que pasar por
  `POST /api/mesas/:mesaId/abrir` primero (lo ve como acción principal
  sobre cualquier mesa gris en su mapa de mesas, sección 14). El menú sigue
  siendo visible/navegable sin restricción; lo único bloqueado es enviar el
  pedido.

Este toggle vive en `restaurantes`, no por mesa, porque es una decisión
operativa del negocio completo (impresión de QR, costo de reimprimir,
proceso de meseros), no algo que cambie mesa por mesa.

**Implementación de referencia del editor:** la pestaña "Plano del local"
de `admin.html` es la versión ejecutable de este editor: toolbar para
agregar mesa/barra/pared/caja/cocina, arrastre libre (Pointer Events) para
reposicionarlos, panel lateral para editar número/capacidad/forma o
eliminar, y las mesas se pintan con el color de su `estado` en vivo (no es
solo un plano estático, también es una vista de ocupación). Cada mesa
agregada o movida se persiste al soltar — no hay botón "Guardar" aparte.

## 5. QR y menú del cliente (público)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/mesas/:mesaId/qr` | staff | URL/imagen del QR para imprimir (encierra `/menu/:qrToken`) |
| GET | `/api/public/menu/:qrToken` | público | Resuelve token → restaurante, mesa, tema y categorías/productos disponibles |
| POST | `/api/public/mesas/:qrToken/llamar-mesero` | público | Crea `llamados_mesa` tipo `llamar_mesero` |
| POST | `/api/public/mesas/:qrToken/solicitar-cuenta` | público | Crea `llamados_mesa` tipo `solicitar_cuenta` y pasa la mesa a `cuenta_solicitada` |
| GET | `/api/llamados?estado=pendiente` | mesero | Bandeja de llamados sin atender (también llega por `/api/pedidos/stream`) |
| PATCH | `/api/llamados/:id` | mesero | `{ estado: 'atendido' }`, registra `atendido_por`/`atendido_en` |

`GET /api/public/menu/:qrToken` es el único endpoint "de entrada" del
cliente final: de una sola llamada obtiene todo lo necesario para pintar la
página (tema + menú + número de mesa), evitando cascadas de requests desde
un celular con conexión mediocre. La respuesta incluye, por producto, su
`disponibleEfectivo` (vista `productos_disponibilidad`), su lista de
`ingredientes` removibles (para el checklist) y sus `adicionales` posibles
(para el selector de extras) — ver sección 7 y 8.

## 6. Menú: categorías y productos (administración)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET/POST | `/api/categorias` | staff / admin | Listar / crear categorías |
| PATCH/DELETE | `/api/categorias/:id` | admin | Editar / eliminar |
| GET/POST | `/api/productos` | staff / admin | Listar (con filtros `categoria_id`, `disponible`) / crear |
| PATCH/DELETE | `/api/productos/:id` | admin | Editar (precio, estación, alérgenos, etc.) / eliminar |
| PATCH | `/api/productos/:id/disponibilidad` | staff | Toggle **manual** "agotado" (independiente del stock, ver sección 7) |
| GET | `/api/alergenos` | staff | Catálogo fijo para poblar checkboxes en el form de producto |

## 7. Ingredientes, receta e inventario

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET/POST | `/api/ingredientes` | admin | Listar (con `stock_actual`, alerta si `< stock_minimo`) / crear ingrediente |
| PATCH/DELETE | `/api/ingredientes/:id` | admin | Editar nombre/unidad/stock_minimo / eliminar |
| POST | `/api/ingredientes/:id/movimientos` | admin | Registrar entrada/salida/ajuste manual; actualiza `stock_actual` y deja rastro en `movimientos_inventario` |
| GET/PUT | `/api/productos/:id/receta` | admin | Lista o reemplaza `producto_ingredientes` del producto (`[{ ingredienteId, cantidadUsada, removible }]`) |

**Descuento automático al vender:** no es un endpoint aparte — pasa dentro
de `POST /api/public/pedidos` / `POST /api/pedidos` (sección 9), en la
misma transacción que crea `items_pedido`: por cada ingrediente de la
receta que el cliente **no** haya excluido, `stock_actual -= cantidad_usada
* cantidad_pedida`. El `CHECK (stock_actual >= 0)` de `schema.sql` actúa
como último seguro ante una condición de carrera (dos pedidos casi
simultáneos agotando lo último); si el UPDATE viola el check, ese producto
se re-marca `agotado` y el pedido responde 409 pidiendo quitarlo o
reemplazarlo.

**"Agotado" es siempre calculado, nunca se escribe a mano en `stock`:** el
admin ajusta `stock_actual` (compras, mermas) desde `POST
/ingredientes/:id/movimientos`; la disponibilidad del producto la deriva la
vista `productos_disponibilidad` en cada lectura. Esto es lo que le da
soporte a "si se acaba el ingrediente, el plato sale agotado solo" sin
que nadie tenga que ir a apagar el producto manualmente.

## 8. Adicionales (extras pagos)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET/POST | `/api/adicionales` | admin | Listar / crear extra (`{ nombre, precio, ingredienteId?, cantidadUsada? }`) |
| PATCH/DELETE | `/api/adicionales/:id` | admin | Editar / eliminar |
| PUT | `/api/productos/:id/adicionales` | admin | Fija qué `adicionales` se ofrecen para ese producto (`producto_adicionales`) |

Si un adicional trae `ingredienteId`, también descuenta stock al venderse
(mismo mecanismo de la sección 7) y también puede quedar sin poderse
ofrecer si ese ingrediente se agota — el menú público filtra los
adicionales igual que filtra productos.

## 9. Pedidos — el flujo en tiempo real

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/public/pedidos` | público (por `qrToken`) | Cliente envía su pedido |
| POST | `/api/pedidos` | mesero | Mesero toma un pedido manualmente en la mesa |
| GET | `/api/pedidos?estado=&estacion=` | cocina / mesero / caja | Lista filtrable (KDS por estación, mesero por sus mesas) |
| GET | `/api/pedidos/stream` | cocina / mesero / caja | **SSE** — eventos en vivo (ver sección 12) |
| PATCH | `/api/items-pedido/:id/estado` | cocina | `pendiente → en_preparacion → listo → entregado` |
| PATCH | `/api/pedidos/:id/estado` | mesero / cocina | Estado agregado del pedido |

Cuerpo de `POST /api/public/pedidos` y `POST /api/pedidos`:

```jsonc
{
  "qrToken": "…",             // solo en la ruta publica
  "items": [
    {
      "productoId": "…",
      "cantidad": 2,
      "ingredientesRemovidos": ["ingrediente-id-suero"],   // checklist "sin ..."
      "adicionales": [{ "adicionalId": "…", "cantidad": 1 }]  // extras pagos
    }
  ]
}
```

**Secuencia completa (QR → cocina → mesero):**

1. Cliente arma el carrito en `menu-cliente.html` marcando qué ingredientes quita y qué adicionales suma, y hace `POST /api/public/pedidos`. Si `!restaurantes.rota_qr && mesa.estado === 'libre'`, el backend responde 409 ("esperando a que el mesero abra la mesa") en vez de crear el pedido — ver sección 4.
2. El backend, en una transacción: revalida `productos_disponibilidad` de cada ítem (por si cambió entre que el cliente cargó el menú y envió el pedido), congela `precio_unitario`/`estacion` en `items_pedido` junto con `ingredientes_removidos` y las filas de `item_pedido_adicionales` (con su propio precio snapshot), **descuenta stock** de cada ingrediente no excluido (sección 7), crea o reutiliza la `cuenta` abierta de la mesa, pasa `mesas.estado → 'ocupada'` si estaba libre, y publica un evento (sección 12).
3. El KDS de cada estación (bar / parrilla / cocina general) está suscrito a `/api/pedidos/stream?estacion=parrilla` y recibe el nuevo item al instante, mostrándolo en `pendiente` con sus exclusiones/adicionales impresos en la tarjeta ("SIN suero costeño", "+ Extra queso").
4. Cocina marca `en_preparacion` y luego `listo` (`PATCH /api/items-pedido/:id/estado`) → esto también se publica; el panel de mesero ve el semáforo cambiar sin refrescar.
5. Cuando todos los items de un pedido están `listo`, el backend marca el pedido como `listo` automáticamente; el mesero lo marca `entregado` al llevarlo a la mesa, lo cual pasa `mesas.estado → 'pedido_servido'`.

## 10. Caja y facturación

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/mesas/:mesaId/cuenta` | caja / mesero | Cuenta abierta actual: items, exclusiones, adicionales y subtotal ya agregados |
| POST | `/api/cuentas/:id/dividir` | caja | `{ tipo: 'partes_iguales', numeroPartes }` o `{ tipo: 'por_items', asignaciones: [{ subCuentaEtiqueta, itemPedidoId, cantidad }] }` |
| POST | `/api/cuentas/:id/propina` | caja | `{ monto }` o `{ porcentaje }` sobre subtotal |
| POST | `/api/cuentas/:id/pagos` | caja | Registra un pago; se puede llamar varias veces para pago mixto (`{ metodo, monto, referencia? }`) hasta cubrir el total |
| POST | `/api/cuentas/:id/cerrar` | caja | Verifica `sum(pagos.monto) >= total`, pasa `estado → 'pagada'`, libera la mesa (`estado → 'libre'`) |

La validación de "¿ya se pagó todo?" vive en `cerrar`, no en cada `POST
/pagos`, para permitir pagos parciales mientras la mesa sigue ocupada
(ej.: alguien se va antes que el resto del grupo).

## 11. Turnos de caja (arqueo)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/turnos` | caja | Abre turno con `monto_inicial` |
| GET | `/api/turnos/actual` | caja | Turno abierto del usuario actual |
| PATCH | `/api/turnos/:id/cerrar` | caja | `{ montoFinalDeclarado }` → calcula `monto_final_sistema` (suma de `pagos` del turno + inicial) y `diferencia` |
| POST | `/api/turnos/:id/movimientos` | caja | Registra retiro/ingreso manual de efectivo durante el turno |

## 12. Arquitectura de tiempo real

**Recomendación: Server-Sent Events sobre Postgres `LISTEN/NOTIFY`**, no
WebSockets ni un broker externo, por tres razones concretas: (1) el tráfico
es unidireccional servidor→cliente en todos los paneles (KDS, mesero, caja
no necesitan enviar datos por ese canal, solo recibir), (2) ya tienen Neon
Postgres con el adaptador `ws` configurado para conexiones persistentes
(commit reciente "forzar ws en Node"), lo que hace `LISTEN/NOTIFY` viable
sin agregar Redis/Pusher, y (3) SSE es HTTP plano: un Route Handler de
Next.js que devuelve un `ReadableStream` con `Content-Type:
text/event-stream`, sin librerías nuevas.

```
Cliente hace POST /api/pedidos o PATCH /api/items-pedido/:id/estado
        │
        ▼
Route Handler escribe en Postgres (transacción)
        │
        ▼
NOTIFY restaurante_<id>, '{"tipo":"item_actualizado","itemId":"..."}'
        │
        ▼
Conexión LISTEN persistente (una por instancia del servidor) recibe el
payload y lo reenvía a cada stream SSE abierto que le corresponda por
restaurante/estación
        │
        ▼
GET /api/pedidos/stream → cada mensaje SSE llega al KDS/mesero/caja
suscrito, que actualiza su UI sin poll
```

**Importante — límite de la plataforma de despliegue:** SSE requiere una
conexión HTTP abierta por minutos/horas. Esto funciona sin problema en un
servidor Node persistente (Docker, un VPS, Railway/Render, o el propio
Hostinger si corre Node de forma persistente). En una plataforma serverless
pura (funciones con timeout corto tipo Vercel Functions clásicas) el stream
se cortaría; ahí la alternativa es *polling eficiente* (`GET
/api/pedidos?desde=<timestamp>` cada 3-5s con ETag/`If-Modified-Since`) o
un servicio administrado (Pusher, Ably, Supabase Realtime). Confirmar el
modelo de despliegue definitivo antes de comprometerse a SSE en producción.

**Fallback de robustez:** cada cliente SSE, al reconectar (por caída de
red), debe pedir primero un snapshot completo (`GET /api/pedidos?estado=...`)
para no perder eventos ocurridos mientras estuvo desconectado — `NOTIFY` no
persiste mensajes no entregados.

**Cómo están conectadas hoy las 4 plantillas (sin backend todavía):**
[`datos-compartidos.js`](./datos-compartidos.js) implementa, en el
navegador, el mismo contrato de esta sección: guarda todo en
`localStorage` (source of truth compartida entre pestañas del mismo
origen) y usa [`canal-tiempo-real.js`](./canal-tiempo-real.js)
(`BroadcastChannel`) en vez de SSE para avisar "algo cambió, vuelve a
leer". Cada función de ese archivo (`crearPedido`, `actualizarEstadoItem`,
`abrirMesa`, `ajustarStock`, `guardarPlano`, ...) es la lógica de negocio
de un endpoint de esta sección, corriendo del lado del cliente. Es
deliberadamente descartable: cuando exista el backend real, esas funciones
se reemplazan por `fetch()`/SSE y el resto de cada plantilla (render,
listeners) cambia poco o nada.

## 13. Seguridad

- **RLS multi-tenant** en Postgres (ver nota al final de `schema.sql`):
  segunda capa de defensa además del filtro `restaurante_id` en cada query.
- **`qr_token` como capability token:** 16 bytes aleatorios (`gen_random_bytes`),
  no secuencial, no adivinable. Los endpoints públicos solo deben aceptar
  operaciones de bajo riesgo (ver menú, pedir, llamar mesero/caja) — nunca
  operaciones administrativas ni datos de otras mesas.
- **Rate limiting** en `/api/public/*` (por IP + por `qrToken`) para evitar
  spam de "llamar mesero" o pedidos duplicados por doble-tap.
- **Rotación de QR (`restaurantes.rota_qr`):** ver sección 4 para el diseño
  completo. Con rotación activa, `qr_token` se regenera al liberar la mesa;
  sin rotación, la apertura manual del mesero es el control equivalente.
  Es una decisión de costo/proceso del restaurante (reimprimir QR o no), no
  solo de seguridad — por eso es un toggle, no un comportamiento fijo.

## 14. Paneles operativos: Mesero, Cocina, Administrador

Los tres son consumidores del mismo backend descrito arriba; ninguno
introduce endpoints nuevos que no estén ya listados, salvo los explícitos
que se marcan abajo. Ver las plantillas `mesero.html`, `cocina.html` y
`admin.html` junto a este archivo.

**Mesero (`mesero.html`):**
- *Mapa de mesas*: grid con el color = `mesas.estado` (libre=gris,
  ocupada=azul, pedido_servido=verde, cuenta_solicitada=ámbar
  parpadeante, reservada=morado). Fuente: `GET /api/mesas` + `/api/pedidos/stream`.
- Tocar una mesa `libre` con `rota_qr=false` ofrece **Abrir mesa**
  (`POST /api/mesas/:id/abrir`, sección 4); con `rota_qr=true` esa acción
  no se muestra (se abre sola con el primer pedido).
  Tocar una mesa ocupada muestra sus pedidos activos y el total corriente
  (`GET /api/mesas/:mesaId/cuenta`), con botón **Marcar entregado** por
  pedido listo (`PATCH /api/pedidos/:id/estado`).
- *Bandeja de llamados*: lista en vivo de `llamados_mesa` pendientes
  (`llamar_mesero` / `solicitar_cuenta`) con botón **Atender**
  (`PATCH /api/llamados/:id` → `estado: 'atendido'`, endpoint implícito en
  el mismo módulo de la sección 5). Es el primer lugar donde un mesero mira
  al entrar a su turno.

**Cocina / KDS (`cocina.html`):**
- Columnas por estación (`bar`, `parrilla`, `cocina_general`) o un filtro
  de estación si la pantalla es angosta; cada una es su propia suscripción
  a `GET /api/pedidos/stream?estacion=X`.
- Cada `item_pedido` es una tarjeta: mesa, producto, cantidad,
  `ingredientes_removidos` resueltos a nombre ("SIN suero costeño") y
  `item_pedido_adicionales` ("+ Extra tocineta"), con semáforo
  verde/amarillo/rojo calculado en el cliente a partir de
  `(now() - creado_en) / productos.tiempo_preparacion_min`.
- Un botón por tarjeta avanza el estado (`pendiente → en_preparacion →
  listo`, `PATCH /api/items-pedido/:id/estado`); al llegar a `listo` la
  tarjeta sale de la columna activa.

**Administrador (`admin.html`):**
- *Tema*: formulario de la sección 3 con vista previa en vivo (reutiliza el
  mismo mecanismo de variables CSS que `menu-cliente.html`).
- *Productos y receta*: tabla de productos con su `disponibleEfectivo`
  (sección 7) visible; al editar uno se abre el editor de receta
  (`GET/PUT /api/productos/:id/receta`) para cargar ingredientes y pesos, y
  el de adicionales ofrecidos (`PUT /api/productos/:id/adicionales`).
- *Inventario*: tabla de `ingredientes` con `stock_actual` vs
  `stock_minimo` (fila resaltada si está por debajo), y un control rápido
  de ajuste que llama `POST /api/ingredientes/:id/movimientos`.
- *Mesas y QR*: lista de mesas con su QR para imprimir
  (`GET /api/mesas/:mesaId/qr`) y el toggle de `rota_qr`
  (`PATCH /api/restaurante`).
