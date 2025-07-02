import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

if (!process.env.GOOGLE_CLIENT_ID) {
  throw new Error('Missing GOOGLE_CLIENT_ID in .env file');
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('Missing GOOGLE_CLIENT_SECRET in .env file');
}
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error(
    'Missing NEXTAUTH_SECRET in .env file. Please provide a secret value for session encryption.'
  );
}

export const {
  handlers: { GET, POST },
  auth,
} = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: '/',
    error: '/unauthorized',
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'google') {
        // This is a simplified check. In a real app, you might want to check against a database of users.
        if (
          profile?.email &&
          (profile.email.endsWith('@3ainvestimentos.com.br') ||
            profile.email.endsWith('@3ariva.com.br'))
        ) {
          return true;
        } else {
          // Redirect to unauthorized page
          return '/unauthorized';
        }
      }
      // Deny other providers
      return false;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});
