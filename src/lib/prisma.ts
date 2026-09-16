import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

// En Node (incluso 22+, que ya trae WebSocket nativo) el driver serverless de Neon
// necesita el paquete "ws": el WebSocket nativo (basado en undici) no le funciona.
// Fuera de Node (Cloudflare/edge) sí hay que usar el WebSocket global del entorno.
if (typeof process !== "undefined" && process.versions?.node) {
  neonConfig.webSocketConstructor = ws;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

// Cachear siempre en globalThis (no solo en dev): evita crear un pool nuevo si el módulo
// llega a re-evaluarse dentro del mismo proceso.
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;
