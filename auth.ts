/**
 * Auth.js (NextAuth v5) — login Google real, liberando SOMENTE ALLOWED_EMAIL.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedGoogleProfile } from "@/lib/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
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
