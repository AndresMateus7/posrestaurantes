import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        const usuario = await prisma.usuario.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!usuario || !usuario.activo) return null;

        const passwordValida = await bcrypt.compare(credentials.password, usuario.passwordHash);
        if (!passwordValida) return null;

        return {
          id: usuario.id,
          usuarioId: usuario.id,
          restauranteId: usuario.restauranteId,
          rol: usuario.rol,
          name: usuario.nombre,
          email: usuario.email,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.usuarioId = user.usuarioId;
        token.restauranteId = user.restauranteId;
        token.rol = user.rol;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.usuarioId = token.usuarioId;
      session.user.restauranteId = token.restauranteId;
      session.user.rol = token.rol;
      return session;
    },
  },
};
