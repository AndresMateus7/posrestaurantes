import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Conexion directa (no pooled): Migrate necesita poder mantener locks/transacciones,
    // lo cual no es confiable a traves del pooler de Neon (ver DATABASE_URL en src/lib/prisma.ts).
    url: env("DATABASE_URL_UNPOOLED"),
  },
});
