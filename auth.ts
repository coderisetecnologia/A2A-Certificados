/**
 * Auth.js (NextAuth v5) — login Google real, liberando SOMENTE ALLOWED_EMAIL.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedGoogleProfile } from "@/lib/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // trim(): valores colados no painel da Vercel com espaço no fim geram
  // "OAuth client was not found" (invalid_client) no Google.
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID?.trim(),
      clientSecret: process.env.AUTH_GOOGLE_SECRET?.trim(),
    }),
  ],
  secret: process.env.AUTH_SECRET?.trim(),
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/acesso-negado",
  },
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      return isAllowedGoogleProfile(profile);
    },
    jwt({ token, profile }) {
      if (profile?.email) token.email = profile.email.toLowerCase();
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.email = typeof token.email === "string" ? token.email : "";
      return session;
    },
  },
});
