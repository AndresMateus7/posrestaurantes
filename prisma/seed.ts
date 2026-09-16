import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Sembrando datos de demo: Restaurante La Gorda...");

  const restaurante = await prisma.restaurante.create({
    data: {
      nombre: "Restaurante La Gorda",
      slug: "la-gorda",
      emailContacto: "contacto@lagorda.demo",
      rotaQr: false,
      tema: {
        create: {
          colorPrimario: "#DC2626",
          colorSecundario: "#1F2937",
          colorFondo: "#F9FAFB",
          colorTexto: "#111827",
          fuente: "Poppins",
        },
      },
    },
  });

  const passwordDemo = await bcrypt.hash("demo1234", 10);
  const [admin, mesero, cocina, caja] = await Promise.all([
    prisma.usuario.create({ data: { restauranteId: restaurante.id, nombre: "Camila Admin", email: "admin@lagorda.demo", passwordHash: passwordDemo, rol: "admin" } }),
    prisma.usuario.create({ data: { restauranteId: restaurante.id, nombre: "Camila Mesera", email: "mesero@lagorda.demo", passwordHash: passwordDemo, rol: "mesero" } }),
    prisma.usuario.create({ data: { restauranteId: restaurante.id, nombre: "Luis Cocina", email: "cocina@lagorda.demo", passwordHash: passwordDemo, rol: "cocina" } }),
    prisma.usuario.create({ data: { restauranteId: restaurante.id, nombre: "Ana Caja", email: "caja@lagorda.demo", passwordHash: passwordDemo, rol: "caja" } }),
  ]);

  // ---------- Plano + mesas ----------
  const layoutMesas = [
    { id: "el-m1", tipo: "mesa", forma: "cuadrada", x: 60, y: 70, ancho: 70, alto: 70, rotacion: 0 },
    { id: "el-m2", tipo: "mesa", forma: "redonda", x: 180, y: 70, ancho: 70, alto: 70, rotacion: 0 },
    { id: "el-m3", tipo: "mesa", forma: "cuadrada", x: 300, y: 70, ancho: 70, alto: 70, rotacion: 0 },
    { id: "el-m4", tipo: "mesa", forma: "redonda", x: 420, y: 70, ancho: 70, alto: 70, rotacion: 0 },
    { id: "el-m5", tipo: "mesa", forma: "cuadrada", x: 60, y: 220, ancho: 70, alto: 70, rotacion: 0 },
    { id: "el-m6", tipo: "mesa", forma: "cuadrada", x: 180, y: 220, ancho: 70, alto: 70, rotacion: 0 },
    { id: "el-m7", tipo: "mesa", forma: "rectangular", x: 290, y: 220, ancho: 110, alto: 70, rotacion: 0 },
    { id: "el-m8", tipo: "mesa", forma: "cuadrada", x: 420, y: 220, ancho: 70, alto: 70, rotacion: 0 },
    { id: "el-barra", tipo: "barra", forma: "rectangular", x: 580, y: 60, ancho: 130, alto: 260, rotacion: 0 },
    { id: "el-cocina", tipo: "cocina", forma: "rectangular", x: 580, y: 340, ancho: 130, alto: 100, rotacion: 0 },
    { id: "el-caja", tipo: "caja", forma: "rectangular", x: 60, y: 340, ancho: 100, alto: 60, rotacion: 0 },
  ];
  const plano = await prisma.plano.create({
    data: { restauranteId: restaurante.id, nombre: "Principal", layout: layoutMesas },
  });

  const mesasSeed = [
    { numero: "1", elementoId: "el-m1", capacidad: 4, estado: "libre" as const },
    { numero: "2", elementoId: "el-m2", capacidad: 2, estado: "ocupada" as const },
    { numero: "3", elementoId: "el-m3", capacidad: 6, estado: "pedido_servido" as const },
    { numero: "4", elementoId: "el-m4", capacidad: 4, estado: "cuenta_solicitada" as const },
    { numero: "5", elementoId: "el-m5", capacidad: 2, estado: "libre" as const },
    { numero: "6", elementoId: "el-m6", capacidad: 8, estado: "ocupada" as const },
    { numero: "7", elementoId: "el-m7", capacidad: 4, estado: "reservada" as const },
    { numero: "8", elementoId: "el-m8", capacidad: 4, estado: "libre" as const },
  ];
  const mesas: Record<string, { id: string }> = {};
  for (const m of mesasSeed) {
    mesas[m.numero] = await prisma.mesa.create({
      data: {
        restauranteId: restaurante.id,
        planoId: plano.id,
        elementoId: m.elementoId,
        numero: m.numero,
        capacidad: m.capacidad,
        estado: m.estado,
        ...(m.numero === "2" || m.numero === "6" ? { meseroId: mesero.id } : {}),
      },
    });
  }

  // ---------- Categorias ----------
  const categorias = {
    entradas: await prisma.categoriaMenu.create({ data: { restauranteId: restaurante.id, nombre: "Entradas", orden: 0 } }),
    fuertes: await prisma.categoriaMenu.create({ data: { restauranteId: restaurante.id, nombre: "Platos fuertes", orden: 1 } }),
    bebidas: await prisma.categoriaMenu.create({ data: { restauranteId: restaurante.id, nombre: "Bebidas", orden: 2 } }),
    postres: await prisma.categoriaMenu.create({ data: { restauranteId: restaurante.id, nombre: "Postres", orden: 3 } }),
  };

  // ---------- Alergenos (catalogo global) ----------
  const nombresAlergenos = ["Gluten", "Lácteos", "Frutos secos", "Mariscos", "Huevo"];
  const alergenos: Record<string, { id: string }> = {};
  for (const nombre of nombresAlergenos) {
    alergenos[nombre] = await prisma.alergeno.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }

  // ---------- Ingredientes ----------
  const ingredientesData = [
    { key: "platano", nombre: "Plátano verde", unidad: "g", stock: 4000, stockMin: 1000 },
    { key: "hogao", nombre: "Hogao", unidad: "g", stock: 3000, stockMin: 800 },
    { key: "suero", nombre: "Suero costeño", unidad: "g", stock: 400, stockMin: 500 },
    { key: "masa", nombre: "Masa de maíz", unidad: "g", stock: 2000, stockMin: 500 },
    { key: "carne", nombre: "Carne guisada", unidad: "g", stock: 1500, stockMin: 500 },
    { key: "cerveza", nombre: "Cerveza artesanal 330ml", unidad: "unidad", stock: 0, stockMin: 24 },
    { key: "limon", nombre: "Limón", unidad: "unidad", stock: 40, stockMin: 20 },
    { key: "queso", nombre: "Queso costeño (adicional)", unidad: "g", stock: 800, stockMin: 300 },
  ];
  const ingredientes: Record<string, { id: string }> = {};
  for (const ing of ingredientesData) {
    ingredientes[ing.key] = await prisma.ingrediente.create({
      data: { restauranteId: restaurante.id, nombre: ing.nombre, unidadMedida: ing.unidad, stockActual: ing.stock, stockMinimo: ing.stockMin },
    });
  }

  // ---------- Adicionales ----------
  const adicionalesData = [
    { key: "queso", nombre: "Extra queso", precio: 3000, ingredienteKey: "queso", cantidadUsada: 40 },
    { key: "aji", nombre: "Ají extra", precio: 1000 },
    { key: "chicharron", nombre: "Chicharrón extra", precio: 5000 },
    { key: "papa", nombre: "Porción extra de papas", precio: 6000 },
    { key: "chantilly", nombre: "Chantilly extra", precio: 1500 },
  ];
  const adicionales: Record<string, { id: string }> = {};
  for (const ad of adicionalesData) {
    adicionales[ad.key] = await prisma.adicional.create({
      data: {
        restauranteId: restaurante.id,
        nombre: ad.nombre,
        precio: ad.precio,
        ingredienteId: ad.ingredienteKey ? ingredientes[ad.ingredienteKey].id : undefined,
        cantidadUsada: ad.cantidadUsada,
      },
    });
  }

  // ---------- Productos ----------
  type ProductoSeed = {
    key: string;
    categoriaId: string;
    nombre: string;
    descripcion: string;
    precio: number;
    estacion: "bar" | "parrilla" | "cocina_general";
    tiempoPrepMin: number;
    disponibleManual: boolean;
    alergenos: string[];
    receta: { ingredienteKey: string; cantidad: number }[];
    adicionales: string[];
  };
  const productosSeed: ProductoSeed[] = [
    { key: "p1", categoriaId: categorias.entradas.id, nombre: "Patacones con hogao", descripcion: "Plátano verde frito, hogao criollo y suero costeño.", precio: 18000, estacion: "cocina_general", tiempoPrepMin: 12, disponibleManual: true, alergenos: ["Lácteos"], receta: [{ ingredienteKey: "platano", cantidad: 150 }, { ingredienteKey: "hogao", cantidad: 80 }, { ingredienteKey: "suero", cantidad: 50 }], adicionales: ["queso"] },
    { key: "p2", categoriaId: categorias.entradas.id, nombre: "Empanadas (x3)", descripcion: "Empanadas de carne con ají casero.", precio: 12000, estacion: "cocina_general", tiempoPrepMin: 12, disponibleManual: true, alergenos: ["Gluten"], receta: [{ ingredienteKey: "masa", cantidad: 120 }, { ingredienteKey: "carne", cantidad: 90 }], adicionales: ["aji"] },
    { key: "p3", categoriaId: categorias.fuertes.id, nombre: "Bandeja Paisa", descripcion: "Frijoles, arroz, carne molida, chicharrón, huevo, arepa y aguacate.", precio: 38000, estacion: "parrilla", tiempoPrepMin: 20, disponibleManual: true, alergenos: ["Huevo"], receta: [], adicionales: ["chicharron"] },
    { key: "p4", categoriaId: categorias.fuertes.id, nombre: "Pechuga a la parrilla", descripcion: "Con papas criollas y ensalada de la casa.", precio: 32000, estacion: "parrilla", tiempoPrepMin: 18, disponibleManual: false, alergenos: [], receta: [], adicionales: ["papa"] },
    { key: "p5", categoriaId: categorias.bebidas.id, nombre: "Limonada de coco", descripcion: "Con hielo y hierbabuena.", precio: 9000, estacion: "bar", tiempoPrepMin: 4, disponibleManual: true, alergenos: [], receta: [{ ingredienteKey: "limon", cantidad: 2 }], adicionales: [] },
    { key: "p6", categoriaId: categorias.bebidas.id, nombre: "Cerveza artesanal", descripcion: "Botella 330ml.", precio: 11000, estacion: "bar", tiempoPrepMin: 3, disponibleManual: true, alergenos: ["Gluten"], receta: [{ ingredienteKey: "cerveza", cantidad: 1 }], adicionales: [] },
    { key: "p7", categoriaId: categorias.postres.id, nombre: "Flan de café", descripcion: "Con crema chantilly.", precio: 10000, estacion: "cocina_general", tiempoPrepMin: 10, disponibleManual: true, alergenos: ["Lácteos", "Huevo"], receta: [], adicionales: ["chantilly"] },
  ];

  const productos: Record<string, { id: string; precio: number; estacion: string; tiempoPrepMin: number }> = {};
  for (const p of productosSeed) {
    const producto = await prisma.producto.create({
      data: {
        restauranteId: restaurante.id,
        categoriaId: p.categoriaId,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precio: p.precio,
        estacion: p.estacion,
        tiempoPreparacionMin: p.tiempoPrepMin,
        disponible: p.disponibleManual,
        alergenos: { create: p.alergenos.map((a) => ({ alergenoId: alergenos[a].id })) },
        ingredientes: { create: p.receta.map((r) => ({ ingredienteId: ingredientes[r.ingredienteKey].id, cantidadUsada: r.cantidad })) },
        adicionales: { create: p.adicionales.map((a) => ({ adicionalId: adicionales[a].id })) },
      },
    });
    productos[p.key] = { id: producto.id, precio: p.precio, estacion: p.estacion, tiempoPrepMin: p.tiempoPrepMin };
  }

  // ---------- Pedidos de demo (mesas 2, 3, 4, 6 ya con actividad) ----------
  const pedidosSeed = [
    { mesa: "2", productoKey: "p1", cantidad: 2, estado: "listo" as const },
    { mesa: "2", productoKey: "p6", cantidad: 2, estado: "entregado" as const },
    { mesa: "3", productoKey: "p3", cantidad: 2, estado: "entregado" as const },
    { mesa: "3", productoKey: "p5", cantidad: 2, estado: "entregado" as const },
    { mesa: "4", productoKey: "p4", cantidad: 1, estado: "entregado" as const },
    { mesa: "4", productoKey: "p7", cantidad: 1, estado: "entregado" as const },
    { mesa: "6", productoKey: "p2", cantidad: 3, estado: "en_preparacion" as const },
    { mesa: "6", productoKey: "p3", cantidad: 4, estado: "pendiente" as const },
  ];
  const pedidoPorMesa: Record<string, { id: string }> = {};
  for (const seed of pedidosSeed) {
    if (!pedidoPorMesa[seed.mesa]) {
      pedidoPorMesa[seed.mesa] = await prisma.pedido.create({
        data: { restauranteId: restaurante.id, mesaId: mesas[seed.mesa].id, origen: "mesero", estado: "en_preparacion", meseroId: mesero.id },
      });
    }
    const producto = productos[seed.productoKey];
    await prisma.itemPedido.create({
      data: {
        pedidoId: pedidoPorMesa[seed.mesa].id,
        productoId: producto.id,
        cantidad: seed.cantidad,
        precioUnitario: producto.precio,
        estacion: producto.estacion as "bar" | "parrilla" | "cocina_general",
        estado: seed.estado,
        listoEn: seed.estado === "listo" || seed.estado === "entregado" ? new Date() : null,
      },
    });
  }

  // ---------- Llamados de mesa ----------
  await prisma.llamadoMesa.create({ data: { restauranteId: restaurante.id, mesaId: mesas["4"].id, tipo: "solicitar_cuenta" } });
  await prisma.llamadoMesa.create({ data: { restauranteId: restaurante.id, mesaId: mesas["6"].id, tipo: "llamar_mesero" } });

  console.log("Listo. Usuarios de demo (contraseña: demo1234):");
  console.log(`  admin  -> ${admin.email}`);
  console.log(`  mesero -> ${mesero.email}`);
  console.log(`  cocina -> ${cocina.email}`);
  console.log(`  caja   -> ${caja.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
