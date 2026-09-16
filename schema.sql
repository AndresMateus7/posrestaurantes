-- =====================================================================
-- SaaS de Gestion Integral para Restaurantes en Tiempo Real
-- Esquema de base de datos - PostgreSQL 15+ (compatible con Neon)
--
-- Convenciones:
--  - UUID como PK en todas las tablas (gen_random_uuid(), requiere pgcrypto).
--  - Cada tabla operativa lleva restaurante_id de forma DIRECTA (no solo via
--    join) aunque se pueda derivar por una relacion intermedia. Esto es a
--    proposito: simplifica Row Level Security multi-tenant (cada politica
--    RLS puede filtrar por restaurante_id sin JOINs) y evita fugas de datos
--    entre inquilinos si alguien olvida un JOIN en una query nueva.
--  - Montos monetarios en INTEGER (pesos COP, sin decimales), igual que la
--    convencion ya usada en este proyecto (Plan.precio en plataforma-sst).
--  - Nombres de tablas/columnas en espanol, igual que el resto del dominio.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------

CREATE TYPE rol_usuario AS ENUM ('admin', 'mesero', 'cocina', 'caja');

CREATE TYPE estado_mesa AS ENUM ('libre', 'ocupada', 'pedido_servido', 'cuenta_solicitada', 'reservada');

CREATE TYPE estacion_cocina AS ENUM ('bar', 'parrilla', 'cocina_general');

CREATE TYPE estado_pedido AS ENUM ('recibido', 'en_preparacion', 'listo', 'entregado', 'cancelado');
CREATE TYPE origen_pedido AS ENUM ('qr_cliente', 'mesero', 'mostrador');
CREATE TYPE estado_item_pedido AS ENUM ('pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado');

CREATE TYPE estado_cuenta AS ENUM ('abierta', 'dividida', 'pagada', 'anulada');
CREATE TYPE tipo_division_cuenta AS ENUM ('partes_iguales', 'por_items');

CREATE TYPE metodo_pago AS ENUM ('efectivo', 'tarjeta_credito', 'tarjeta_debito', 'nequi', 'daviplata', 'transferencia');

CREATE TYPE estado_turno AS ENUM ('abierto', 'cerrado');
CREATE TYPE tipo_movimiento_caja AS ENUM ('venta', 'retiro', 'ingreso_manual');
CREATE TYPE tipo_movimiento_inventario AS ENUM ('entrada', 'salida', 'ajuste');

CREATE TYPE tipo_llamado AS ENUM ('llamar_mesero', 'solicitar_cuenta');
CREATE TYPE estado_llamado AS ENUM ('pendiente', 'atendido');

-- ---------------------------------------------------------------------
-- Utilidad: trigger generico para mantener actualizado_en
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. TENANTS Y USUARIOS
-- =====================================================================

CREATE TABLE restaurantes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,           -- usado en URLs publicas (/r/slug/mesa/...)
  nit            TEXT,
  email_contacto TEXT NOT NULL,
  telefono       TEXT,
  direccion      TEXT,
  -- Si es true, mesas.qr_token se regenera automaticamente cada vez que la
  -- mesa vuelve a 'libre' (un QR fotografiado deja de servir). Si es false,
  -- el QR es fijo/impreso una sola vez, y por seguridad el pedido publico
  -- queda bloqueado hasta que un mesero abra la mesa manualmente
  -- (POST /api/mesas/:id/abrir, ver arquitectura-backend.md sec. 4).
  rota_qr        BOOLEAN NOT NULL DEFAULT false,
  activo         BOOLEAN NOT NULL DEFAULT true,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Branding dinamico (Requerimiento A). 1:1 con restaurantes; separado de la
-- tabla principal porque cambia con otra cadencia y así el admin puede
-- tener permisos distintos sobre "tema" vs "datos legales del negocio".
CREATE TABLE configuracion_tema (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  UUID NOT NULL UNIQUE REFERENCES restaurantes(id) ON DELETE CASCADE,
  logo_url        TEXT,
  favicon_url     TEXT,
  color_primario  TEXT NOT NULL DEFAULT '#DC2626',
  color_secundario TEXT NOT NULL DEFAULT '#1F2937',
  color_fondo     TEXT NOT NULL DEFAULT '#F9FAFB',
  color_texto     TEXT NOT NULL DEFAULT '#111827',
  fuente          TEXT NOT NULL DEFAULT 'Poppins',
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_configuracion_tema_actualizado
  BEFORE UPDATE ON configuracion_tema
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

CREATE TABLE usuarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  rol            rol_usuario NOT NULL,
  activo         BOOLEAN NOT NULL DEFAULT true,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, email)
);

CREATE INDEX idx_usuarios_restaurante ON usuarios(restaurante_id);

-- =====================================================================
-- 2. PLANO 2D Y MESAS
--    El lienzo (paredes, barra, caja, decoracion, forma/posicion de cada
--    mesa) se guarda como JSON: es lo que pide el editor drag-and-drop y
--    evita migraciones cada vez que se agrega un tipo de figura nueva.
--    Las mesas SI son una tabla relacional aparte porque son la entidad
--    operativa: reciben pedidos, cambian de estado en tiempo real y deben
--    poder consultarse/filtrarse con indices, no dentro de un blob JSON.
-- =====================================================================

CREATE TABLE planos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL DEFAULT 'Principal',  -- ej: "Salon principal", "Terraza"
  -- Array de figuras: [{ id, tipo, forma, etiqueta, x, y, ancho, alto, rotacion, z_index, color }]
  -- tipo:  'mesa' | 'barra' | 'pared' | 'caja' | 'cocina' | 'decoracion'
  -- forma: 'cuadrada' | 'redonda' | 'rectangular' (solo aplica a mesa/barra)
  -- Se valida en la capa de aplicacion (p.ej. con un enum de Zod), no con un
  -- tipo de Postgres, porque vive dentro de un blob JSON.
  -- El campo "id" de cada figura es un uuid generado en el cliente (canvas),
  -- y es el que referencia mesas.elemento_id (referencia logica, no FK,
  -- porque vive dentro del JSON).
  layout         JSONB NOT NULL DEFAULT '[]',
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planos_restaurante ON planos(restaurante_id);

CREATE TRIGGER trg_planos_actualizado
  BEFORE UPDATE ON planos
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

CREATE TABLE mesas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  plano_id       UUID NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
  elemento_id    UUID NOT NULL,      -- id de la figura dentro de planos.layout
  numero         TEXT NOT NULL,      -- etiqueta visible: "Mesa 5", "B3"
  capacidad      SMALLINT NOT NULL DEFAULT 4,
  -- 'libre' -> 'ocupada' ocurre de dos formas segun restaurantes.rota_qr:
  -- con rotacion, el primer pedido publico la abre solo; sin rotacion, un
  -- mesero debe abrirla a mano (POST /api/mesas/:id/abrir) antes de que el
  -- menu publico acepte pedidos de esa mesa.
  estado         estado_mesa NOT NULL DEFAULT 'libre',
  qr_token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  mesero_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plano_id, elemento_id)
);

CREATE INDEX idx_mesas_restaurante_estado ON mesas(restaurante_id, estado);

CREATE TRIGGER trg_mesas_actualizado
  BEFORE UPDATE ON mesas
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

-- =====================================================================
-- 3. MENU: CATEGORIAS, PRODUCTOS, ALERGENOS
-- =====================================================================

CREATE TABLE categorias_menu (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL,
  descripcion    TEXT,
  imagen_url     TEXT,
  orden          SMALLINT NOT NULL DEFAULT 0,
  activo         BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_categorias_restaurante ON categorias_menu(restaurante_id, orden);

CREATE TABLE alergenos (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,   -- gluten, lacteos, frutos_secos, mariscos, ...
  icono  TEXT
);

CREATE TABLE productos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  categoria_id        UUID NOT NULL REFERENCES categorias_menu(id) ON DELETE RESTRICT,
  nombre              TEXT NOT NULL,
  descripcion         TEXT,
  precio              INTEGER NOT NULL CHECK (precio >= 0),
  imagen_url          TEXT,
  estacion            estacion_cocina NOT NULL DEFAULT 'cocina_general',
  tiempo_preparacion_min SMALLINT NOT NULL DEFAULT 15,  -- usado para semaforizacion en KDS
  disponible          BOOLEAN NOT NULL DEFAULT true,     -- toggle rapido de "agotado"
  orden               SMALLINT NOT NULL DEFAULT 0,
  creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_productos_restaurante_categoria ON productos(restaurante_id, categoria_id);
CREATE INDEX idx_productos_disponible ON productos(restaurante_id, disponible);

CREATE TABLE producto_alergenos (
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  alergeno_id UUID NOT NULL REFERENCES alergenos(id) ON DELETE CASCADE,
  PRIMARY KEY (producto_id, alergeno_id)
);

-- =====================================================================
-- 4. INGREDIENTES, RECETAS E INVENTARIO
--    La receta (producto_ingredientes) es la lista de ingredientes y peso
--    usado por porcion. Sirve para dos cosas: (1) pintar en el menu del
--    cliente el checklist "quitar ingrediente" en vez de un campo de texto
--    libre, y (2) descontar stock al crear cada item_pedido y derivar el
--    "agotado" automatico (ver vista al final de esta seccion).
-- =====================================================================

CREATE TABLE ingredientes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL,
  unidad_medida  TEXT NOT NULL DEFAULT 'g',  -- 'g', 'ml', 'unidad'... texto libre, no enum: varia por restaurante
  stock_actual   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo   NUMERIC(10,2) NOT NULL DEFAULT 0,  -- umbral de alerta "por agotarse" en el panel admin
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, nombre)
);

CREATE INDEX idx_ingredientes_restaurante ON ingredientes(restaurante_id);

CREATE TRIGGER trg_ingredientes_actualizado
  BEFORE UPDATE ON ingredientes
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

-- removible=true (el default, y lo normal) habilita el checkbox "sin X" en
-- el menu del cliente. removible=false es para algo estructural que no
-- tendria sentido quitar; queda disponible por si algun producto lo necesita.
CREATE TABLE producto_ingredientes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id    UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  ingrediente_id UUID NOT NULL REFERENCES ingredientes(id) ON DELETE RESTRICT,
  cantidad_usada NUMERIC(10,2) NOT NULL CHECK (cantidad_usada > 0),  -- en la unidad_medida del ingrediente
  removible      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (producto_id, ingrediente_id)
);

CREATE INDEX idx_producto_ingredientes_producto ON producto_ingredientes(producto_id);
CREATE INDEX idx_producto_ingredientes_ingrediente ON producto_ingredientes(ingrediente_id);

-- Auditoria de entradas/salidas manuales de inventario (compras, mermas,
-- ajustes de conteo fisico). El descuento por venta se hace directo sobre
-- ingredientes.stock_actual dentro de la misma transaccion que crea el
-- pedido (ver arquitectura-backend.md sec. 7); no pasa por esta tabla para
-- no duplicar una fila por cada item vendido.
CREATE TABLE movimientos_inventario (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingrediente_id UUID NOT NULL REFERENCES ingredientes(id) ON DELETE CASCADE,
  tipo           tipo_movimiento_inventario NOT NULL,
  cantidad       NUMERIC(10,2) NOT NULL,
  motivo         TEXT,
  usuario_id     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_movimientos_inventario_ingrediente ON movimientos_inventario(ingrediente_id, creado_en);

-- "Agotado automatico": disponible_efectivo cruza el toggle manual del
-- admin (productos.disponible) con el stock real. Se evalua contra TODOS
-- los ingredientes de la receta (no solo los no removibles) porque no se
-- puede asumir de antemano que el proximo cliente vaya a quitar justo el
-- que esta agotado; un producto sin receta cargada (0 filas) se considera
-- siempre disponible_por_stock=true (todavia no se le configuro inventario).
CREATE OR REPLACE VIEW productos_disponibilidad AS
SELECT
  p.id AS producto_id,
  p.disponible AS disponible_manual,
  NOT EXISTS (
    SELECT 1 FROM producto_ingredientes pi
    JOIN ingredientes i ON i.id = pi.ingrediente_id
    WHERE pi.producto_id = p.id AND i.stock_actual < pi.cantidad_usada
  ) AS disponible_por_stock,
  p.disponible AND NOT EXISTS (
    SELECT 1 FROM producto_ingredientes pi
    JOIN ingredientes i ON i.id = pi.ingrediente_id
    WHERE pi.producto_id = p.id AND i.stock_actual < pi.cantidad_usada
  ) AS disponible_efectivo
FROM productos p;

-- =====================================================================
-- 5. ADICIONALES (extras pagos, ej. "Extra queso +$3.000")
--    Un adicional puede enlazar a un ingrediente (para tambien descontar
--    stock al venderse) o no (ingrediente_id NULL) si es algo puramente de
--    servicio, ej. "Para llevar +$1.000".
-- =====================================================================

CREATE TABLE adicionales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL,
  precio         INTEGER NOT NULL CHECK (precio >= 0),
  ingrediente_id UUID REFERENCES ingredientes(id) ON DELETE SET NULL,
  cantidad_usada NUMERIC(10,2),  -- cuanto del ingrediente consume 1 unidad de este adicional
  activo         BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_adicionales_restaurante ON adicionales(restaurante_id);

-- Que adicionales se pueden ofrecer en que producto (ej. "extra queso" no
-- deberia aparecer en una ensalada de fruta).
CREATE TABLE producto_adicionales (
  producto_id  UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  adicional_id UUID NOT NULL REFERENCES adicionales(id) ON DELETE CASCADE,
  PRIMARY KEY (producto_id, adicional_id)
);

-- =====================================================================
-- 6. PEDIDOS (comandas) E ITEMS
--    items_pedido guarda una "foto" del precio y la estacion en el momento
--    de pedir: si el admin sube el precio o cambia de estacion un producto
--    despues, las comandas y facturas ya emitidas NO deben cambiar.
-- =====================================================================

CREATE TABLE pedidos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  mesa_id        UUID NOT NULL REFERENCES mesas(id) ON DELETE RESTRICT,
  cuenta_id      UUID,  -- FK agregada mas abajo con ALTER TABLE (cuentas aun no existe en este punto)
  origen         origen_pedido NOT NULL DEFAULT 'qr_cliente',
  mesero_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  estado         estado_pedido NOT NULL DEFAULT 'recibido',
  notas_generales TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (la referencia circular pedidos.cuenta_id <-> cuentas.mesa_id se resuelve
--  abajo: cuentas se crea despues, por eso el FK de arriba se agrega con
--  ALTER TABLE al final del archivo)

CREATE INDEX idx_pedidos_restaurante_estado ON pedidos(restaurante_id, estado);
CREATE INDEX idx_pedidos_mesa ON pedidos(mesa_id);

CREATE TRIGGER trg_pedidos_actualizado
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

CREATE TABLE items_pedido (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id     UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad        SMALLINT NOT NULL CHECK (cantidad > 0),
  precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0),  -- snapshot
  estacion        estacion_cocina NOT NULL,                       -- snapshot, enruta al KDS correcto
  -- Ids de producto_ingredientes.ingrediente_id que el cliente quito con el
  -- checklist del menu (reemplaza el campo de texto libre para exclusiones).
  -- Es JSON y no una tabla-join porque es una lista chica, propia de esta
  -- fila, que nunca se consulta de forma cruzada entre pedidos -- mismo
  -- criterio que planos.layout.
  ingredientes_removidos JSONB NOT NULL DEFAULT '[]',
  notas           TEXT,  -- catch-all libre para pedidos tomados por el mesero; el menu QR ya no lo expone
  estado          estado_item_pedido NOT NULL DEFAULT 'pendiente',
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  listo_en        TIMESTAMPTZ    -- se llena cuando cocina marca "listo"; junto con creado_en
                                 -- alimenta la semaforizacion verde/amarillo/rojo del KDS
);

CREATE INDEX idx_items_pedido_pedido ON items_pedido(pedido_id);
CREATE INDEX idx_items_pedido_estacion_estado ON items_pedido(estacion, estado);

-- Adicionales pagos elegidos para este item especifico (ver seccion 5).
-- precio_unitario es snapshot, mismo criterio que items_pedido.
CREATE TABLE item_pedido_adicionales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_pedido_id  UUID NOT NULL REFERENCES items_pedido(id) ON DELETE CASCADE,
  adicional_id    UUID NOT NULL REFERENCES adicionales(id) ON DELETE RESTRICT,
  cantidad        SMALLINT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0)
);

CREATE INDEX idx_item_pedido_adicionales_item ON item_pedido_adicionales(item_pedido_id);

-- =====================================================================
-- 7. CUENTAS, DIVISION Y PAGOS
-- =====================================================================

CREATE TABLE cuentas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  mesa_id        UUID NOT NULL REFERENCES mesas(id) ON DELETE RESTRICT,
  estado         estado_cuenta NOT NULL DEFAULT 'abierta',
  -- subtotal = sum(items_pedido.precio_unitario * cantidad) de todos los
  -- pedidos de la mesa asociados a esta cuenta,
  -- MAS sum(item_pedido_adicionales.precio_unitario * cantidad).
  subtotal       INTEGER NOT NULL DEFAULT 0,
  propina        INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL DEFAULT 0,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_en     TIMESTAMPTZ
);

CREATE INDEX idx_cuentas_restaurante_estado ON cuentas(restaurante_id, estado);
CREATE INDEX idx_cuentas_mesa ON cuentas(mesa_id);

-- FK pendiente de pedidos.cuenta_id (ver nota arriba)
ALTER TABLE pedidos
  ADD CONSTRAINT fk_pedidos_cuenta FOREIGN KEY (cuenta_id) REFERENCES cuentas(id) ON DELETE SET NULL;

-- "Dividir en partes iguales": sub_cuentas sin items propios, solo N partes
-- del total. "Dividir por items": sub_cuentas + sub_cuenta_items indicando
-- que porcion de cada item_pedido paga cada sub-cuenta (permite repartir
-- un plato compartido entre 2 personas con cantidad_asignada fraccionada
-- a nivel de unidades, ej. 1 de 2 cervezas).
CREATE TABLE sub_cuentas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id      UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  tipo_division  tipo_division_cuenta NOT NULL,
  etiqueta       TEXT NOT NULL DEFAULT 'Comensal',  -- "Persona 1", "Persona 2"
  monto          INTEGER NOT NULL DEFAULT 0,
  pagado         BOOLEAN NOT NULL DEFAULT false,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_cuentas_cuenta ON sub_cuentas(cuenta_id);

CREATE TABLE sub_cuenta_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_cuenta_id  UUID NOT NULL REFERENCES sub_cuentas(id) ON DELETE CASCADE,
  item_pedido_id UUID NOT NULL REFERENCES items_pedido(id) ON DELETE CASCADE,
  cantidad_asignada SMALLINT NOT NULL CHECK (cantidad_asignada > 0)
  -- Invariante de aplicacion (no impuesta por CHECK entre filas):
  -- sum(cantidad_asignada) por item_pedido_id <= items_pedido.cantidad
);

CREATE INDEX idx_sub_cuenta_items_item ON sub_cuenta_items(item_pedido_id);

-- Pagos mixtos: una cuenta (o una sub_cuenta cuando la division ya se pago
-- por separado) puede tener VARIAS filas de pago que sumen el total.
CREATE TABLE pagos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id             UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  sub_cuenta_id         UUID REFERENCES sub_cuentas(id) ON DELETE SET NULL,
  metodo                metodo_pago NOT NULL,
  monto                 INTEGER NOT NULL CHECK (monto > 0),
  referencia_transaccion TEXT,   -- id de transaccion Nequi/Daviplata/datafono
  recibido_por          UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pagos_cuenta ON pagos(cuenta_id);

-- =====================================================================
-- 8. CAJA: TURNOS Y ARQUEO
-- =====================================================================

CREATE TABLE turnos_caja (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id        UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  usuario_id            UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  estado                estado_turno NOT NULL DEFAULT 'abierto',
  monto_inicial         INTEGER NOT NULL DEFAULT 0,
  monto_final_declarado INTEGER,             -- lo que el cajero cuenta fisicamente
  monto_final_sistema   INTEGER,             -- lo que el sistema calculo (ventas + inicial)
  diferencia            INTEGER,             -- declarado - sistema (arqueo)
  abierto_en            TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_en            TIMESTAMPTZ
);

CREATE INDEX idx_turnos_restaurante_estado ON turnos_caja(restaurante_id, estado);

CREATE TABLE movimientos_caja (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id    UUID NOT NULL REFERENCES turnos_caja(id) ON DELETE CASCADE,
  tipo        tipo_movimiento_caja NOT NULL,
  monto       INTEGER NOT NULL,
  descripcion TEXT,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_movimientos_turno ON movimientos_caja(turno_id);

-- =====================================================================
-- 9. LLAMADOS DE MESA ("Llamar al Mesero" / "Solicitar la Cuenta")
-- =====================================================================

CREATE TABLE llamados_mesa (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  mesa_id        UUID NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
  tipo           tipo_llamado NOT NULL,
  estado         estado_llamado NOT NULL DEFAULT 'pendiente',
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atendido_en    TIMESTAMPTZ,
  atendido_por   UUID REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX idx_llamados_restaurante_estado ON llamados_mesa(restaurante_id, estado);

-- =====================================================================
-- Nota sobre Row Level Security (recomendado para multi-tenant en Postgres/Neon)
--
-- ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation ON productos
--   USING (restaurante_id = current_setting('app.restaurante_id')::uuid);
--
-- Repetir por tabla que tenga restaurante_id, y setear
-- `SET app.restaurante_id = '...'` al inicio de cada request autenticado
-- (por ejemplo en un middleware de Prisma $extends o en el pool de conexion).
-- Esto es una segunda capa de defensa ademas del filtro en cada query.
-- =====================================================================
