import NextAuth, { AuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

if (!process.env.GOOGLE_CLIENT_ID) {
  throw new Error('Missing GOOGLE_CLIENT_ID in .env file');
}

if (!process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('Missing GOOGLE_CLIENT_SECRET in .env file');
}

const ALLOWED_DOMAIN = "@3ainvestimentos.com.br";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return false; // Only allow Google provider
      }

      if (!profile?.email) {
        return false; // Deny if no email is provided
      }
      
      const isEmailVerified = profile.email_verified === true || profile.email_verified === 'true';

      if (isEmailVerified && profile.email.endsWith(ALLOWED_DOMAIN)) {
        return true; // Allow sign in
      }
      
      // Return a URL to redirect to a custom error page for unauthorized users
      // You can create a page at `/unauthorized` to explain why they couldn't sign in.
      return '/unauthorized';
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
