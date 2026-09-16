import type { RolUsuario } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      usuarioId: string;
      restauranteId: string;
      rol: RolUsuario;
    } & DefaultSession["user"];
  }

  interface User {
    usuarioId: string;
    restauranteId: string;
    rol: RolUsuario;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    usuarioId: string;
    restauranteId: string;
    rol: RolUsuario;
  }
}
