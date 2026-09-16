-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('admin', 'mesero', 'cocina', 'caja');

-- CreateEnum
CREATE TYPE "EstadoMesa" AS ENUM ('libre', 'ocupada', 'pedido_servido', 'cuenta_solicitada', 'reservada');

-- CreateEnum
CREATE TYPE "EstacionCocina" AS ENUM ('bar', 'parrilla', 'cocina_general');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('recibido', 'en_preparacion', 'listo', 'entregado', 'cancelado');

-- CreateEnum
CREATE TYPE "OrigenPedido" AS ENUM ('qr_cliente', 'mesero', 'mostrador');

-- CreateEnum
CREATE TYPE "EstadoItemPedido" AS ENUM ('pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado');

-- CreateEnum
CREATE TYPE "EstadoCuenta" AS ENUM ('abierta', 'dividida', 'pagada', 'anulada');

-- CreateEnum
CREATE TYPE "TipoDivisionCuenta" AS ENUM ('partes_iguales', 'por_items');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('efectivo', 'tarjeta_credito', 'tarjeta_debito', 'nequi', 'daviplata', 'transferencia');

-- CreateEnum
CREATE TYPE "EstadoTurno" AS ENUM ('abierto', 'cerrado');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('venta', 'retiro', 'ingreso_manual');

-- CreateEnum
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('entrada', 'salida', 'ajuste');

-- CreateEnum
CREATE TYPE "TipoLlamado" AS ENUM ('llamar_mesero', 'solicitar_cuenta');

-- CreateTable
CREATE TABLE "restaurantes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nit" TEXT,
    "email_contacto" TEXT NOT NULL,
    "telefono" TEXT,
    "direccion" TEXT,
    "rota_qr" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_tema" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "logo_url" TEXT,
    "favicon_url" TEXT,
    "color_primario" TEXT NOT NULL DEFAULT '#DC2626',
    "color_secundario" TEXT NOT NULL DEFAULT '#1F2937',
    "color_fondo" TEXT NOT NULL DEFAULT '#F9FAFB',
    "color_texto" TEXT NOT NULL DEFAULT '#111827',
    "fuente" TEXT NOT NULL DEFAULT 'Poppins',
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_tema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT 'Principal',
    "layout" JSONB NOT NULL DEFAULT '[]',
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesas" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "plano_id" TEXT NOT NULL,
    "elemento_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "capacidad" INTEGER NOT NULL DEFAULT 4,
    "estado" "EstadoMesa" NOT NULL DEFAULT 'libre',
    "qr_token" TEXT NOT NULL,
    "mesero_id" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mesas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_menu" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "imagen_url" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alergenos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "icono" TEXT,

    CONSTRAINT "alergenos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" INTEGER NOT NULL,
    "imagen_url" TEXT,
    "estacion" "EstacionCocina" NOT NULL DEFAULT 'cocina_general',
    "tiempo_preparacion_min" INTEGER NOT NULL DEFAULT 15,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_alergenos" (
    "producto_id" TEXT NOT NULL,
    "alergeno_id" TEXT NOT NULL,

    CONSTRAINT "producto_alergenos_pkey" PRIMARY KEY ("producto_id","alergeno_id")
);

-- CreateTable
CREATE TABLE "ingredientes" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad_medida" TEXT NOT NULL DEFAULT 'g',
    "stock_actual" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_ingredientes" (
    "id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "ingrediente_id" TEXT NOT NULL,
    "cantidad_usada" DECIMAL(10,2) NOT NULL,
    "removible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "producto_ingredientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_inventario" (
    "id" TEXT NOT NULL,
    "ingrediente_id" TEXT NOT NULL,
    "tipo" "TipoMovimientoInventario" NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "motivo" TEXT,
    "usuario_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adicionales" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" INTEGER NOT NULL,
    "ingrediente_id" TEXT,
    "cantidad_usada" DECIMAL(10,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "adicionales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_adicionales" (
    "producto_id" TEXT NOT NULL,
    "adicional_id" TEXT NOT NULL,

    CONSTRAINT "producto_adicionales_pkey" PRIMARY KEY ("producto_id","adicional_id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "mesa_id" TEXT NOT NULL,
    "cuenta_id" TEXT,
    "origen" "OrigenPedido" NOT NULL DEFAULT 'qr_cliente',
    "mesero_id" TEXT,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'recibido',
    "notas_generales" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_pedido" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" INTEGER NOT NULL,
    "estacion" "EstacionCocina" NOT NULL,
    "ingredientes_removidos" JSONB NOT NULL DEFAULT '[]',
    "notas" TEXT,
    "estado" "EstadoItemPedido" NOT NULL DEFAULT 'pendiente',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listo_en" TIMESTAMP(3),

    CONSTRAINT "items_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_pedido_adicionales" (
    "id" TEXT NOT NULL,
    "item_pedido_id" TEXT NOT NULL,
    "adicional_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "precio_unitario" INTEGER NOT NULL,

    CONSTRAINT "item_pedido_adicionales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "mesa_id" TEXT NOT NULL,
    "estado" "EstadoCuenta" NOT NULL DEFAULT 'abierta',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "propina" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrado_en" TIMESTAMP(3),

    CONSTRAINT "cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_cuentas" (
    "id" TEXT NOT NULL,
    "cuenta_id" TEXT NOT NULL,
    "tipo_division" "TipoDivisionCuenta" NOT NULL,
    "etiqueta" TEXT NOT NULL DEFAULT 'Comensal',
    "monto" INTEGER NOT NULL DEFAULT 0,
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_cuenta_items" (
    "id" TEXT NOT NULL,
    "sub_cuenta_id" TEXT NOT NULL,
    "item_pedido_id" TEXT NOT NULL,
    "cantidad_asignada" INTEGER NOT NULL,

    CONSTRAINT "sub_cuenta_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" TEXT NOT NULL,
    "cuenta_id" TEXT NOT NULL,
    "sub_cuenta_id" TEXT,
    "metodo" "MetodoPago" NOT NULL,
    "monto" INTEGER NOT NULL,
    "referencia_transaccion" TEXT,
    "recibido_por" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnos_caja" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "estado" "EstadoTurno" NOT NULL DEFAULT 'abierto',
    "monto_inicial" INTEGER NOT NULL DEFAULT 0,
    "monto_final_declarado" INTEGER,
    "monto_final_sistema" INTEGER,
    "diferencia" INTEGER,
    "abierto_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrado_en" TIMESTAMP(3),

    CONSTRAINT "turnos_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_caja" (
    "id" TEXT NOT NULL,
    "turno_id" TEXT NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "monto" INTEGER NOT NULL,
    "descripcion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llamados_mesa" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "mesa_id" TEXT NOT NULL,
    "tipo" "TipoLlamado" NOT NULL,
    "atendido" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendido_en" TIMESTAMP(3),
    "atendido_por" TEXT,

    CONSTRAINT "llamados_mesa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurantes_slug_key" ON "restaurantes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_tema_restaurante_id_key" ON "configuracion_tema"("restaurante_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_restaurante_id_idx" ON "usuarios"("restaurante_id");

-- CreateIndex
CREATE UNIQUE INDEX "mesas_qr_token_key" ON "mesas"("qr_token");

-- CreateIndex
CREATE INDEX "mesas_restaurante_id_estado_idx" ON "mesas"("restaurante_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "mesas_plano_id_elemento_id_key" ON "mesas"("plano_id", "elemento_id");

-- CreateIndex
CREATE INDEX "categorias_menu_restaurante_id_orden_idx" ON "categorias_menu"("restaurante_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "alergenos_nombre_key" ON "alergenos"("nombre");

-- CreateIndex
CREATE INDEX "productos_restaurante_id_categoria_id_idx" ON "productos"("restaurante_id", "categoria_id");

-- CreateIndex
CREATE INDEX "productos_restaurante_id_disponible_idx" ON "productos"("restaurante_id", "disponible");

-- CreateIndex
CREATE UNIQUE INDEX "ingredientes_restaurante_id_nombre_key" ON "ingredientes"("restaurante_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "producto_ingredientes_producto_id_ingrediente_id_key" ON "producto_ingredientes"("producto_id", "ingrediente_id");

-- CreateIndex
CREATE INDEX "movimientos_inventario_ingrediente_id_creado_en_idx" ON "movimientos_inventario"("ingrediente_id", "creado_en");

-- CreateIndex
CREATE INDEX "adicionales_restaurante_id_idx" ON "adicionales"("restaurante_id");

-- CreateIndex
CREATE INDEX "pedidos_restaurante_id_estado_idx" ON "pedidos"("restaurante_id", "estado");

-- CreateIndex
CREATE INDEX "pedidos_mesa_id_idx" ON "pedidos"("mesa_id");

-- CreateIndex
CREATE INDEX "items_pedido_pedido_id_idx" ON "items_pedido"("pedido_id");

-- CreateIndex
CREATE INDEX "items_pedido_estacion_estado_idx" ON "items_pedido"("estacion", "estado");

-- CreateIndex
CREATE INDEX "item_pedido_adicionales_item_pedido_id_idx" ON "item_pedido_adicionales"("item_pedido_id");

-- CreateIndex
CREATE INDEX "cuentas_restaurante_id_estado_idx" ON "cuentas"("restaurante_id", "estado");

-- CreateIndex
CREATE INDEX "cuentas_mesa_id_idx" ON "cuentas"("mesa_id");

-- CreateIndex
CREATE INDEX "sub_cuentas_cuenta_id_idx" ON "sub_cuentas"("cuenta_id");

-- CreateIndex
CREATE INDEX "sub_cuenta_items_item_pedido_id_idx" ON "sub_cuenta_items"("item_pedido_id");

-- CreateIndex
CREATE INDEX "pagos_cuenta_id_idx" ON "pagos"("cuenta_id");

-- CreateIndex
CREATE INDEX "turnos_caja_restaurante_id_estado_idx" ON "turnos_caja"("restaurante_id", "estado");

-- CreateIndex
CREATE INDEX "movimientos_caja_turno_id_idx" ON "movimientos_caja"("turno_id");

-- CreateIndex
CREATE INDEX "llamados_mesa_restaurante_id_atendido_idx" ON "llamados_mesa"("restaurante_id", "atendido");

-- AddForeignKey
ALTER TABLE "configuracion_tema" ADD CONSTRAINT "configuracion_tema_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos" ADD CONSTRAINT "planos_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_mesero_id_fkey" FOREIGN KEY ("mesero_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_menu" ADD CONSTRAINT "categorias_menu_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_alergenos" ADD CONSTRAINT "producto_alergenos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_alergenos" ADD CONSTRAINT "producto_alergenos_alergeno_id_fkey" FOREIGN KEY ("alergeno_id") REFERENCES "alergenos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredientes" ADD CONSTRAINT "ingredientes_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_ingredientes" ADD CONSTRAINT "producto_ingredientes_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_ingredientes" ADD CONSTRAINT "producto_ingredientes_ingrediente_id_fkey" FOREIGN KEY ("ingrediente_id") REFERENCES "ingredientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_ingrediente_id_fkey" FOREIGN KEY ("ingrediente_id") REFERENCES "ingredientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adicionales" ADD CONSTRAINT "adicionales_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adicionales" ADD CONSTRAINT "adicionales_ingrediente_id_fkey" FOREIGN KEY ("ingrediente_id") REFERENCES "ingredientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_adicionales" ADD CONSTRAINT "producto_adicionales_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_adicionales" ADD CONSTRAINT "producto_adicionales_adicional_id_fkey" FOREIGN KEY ("adicional_id") REFERENCES "adicionales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_mesero_id_fkey" FOREIGN KEY ("mesero_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_pedido" ADD CONSTRAINT "items_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_pedido" ADD CONSTRAINT "items_pedido_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido_adicionales" ADD CONSTRAINT "item_pedido_adicionales_item_pedido_id_fkey" FOREIGN KEY ("item_pedido_id") REFERENCES "items_pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido_adicionales" ADD CONSTRAINT "item_pedido_adicionales_adicional_id_fkey" FOREIGN KEY ("adicional_id") REFERENCES "adicionales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_cuentas" ADD CONSTRAINT "sub_cuentas_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_cuenta_items" ADD CONSTRAINT "sub_cuenta_items_sub_cuenta_id_fkey" FOREIGN KEY ("sub_cuenta_id") REFERENCES "sub_cuentas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_cuenta_items" ADD CONSTRAINT "sub_cuenta_items_item_pedido_id_fkey" FOREIGN KEY ("item_pedido_id") REFERENCES "items_pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_sub_cuenta_id_fkey" FOREIGN KEY ("sub_cuenta_id") REFERENCES "sub_cuentas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_recibido_por_fkey" FOREIGN KEY ("recibido_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turnos_caja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llamados_mesa" ADD CONSTRAINT "llamados_mesa_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llamados_mesa" ADD CONSTRAINT "llamados_mesa_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llamados_mesa" ADD CONSTRAINT "llamados_mesa_atendido_por_fkey" FOREIGN KEY ("atendido_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
