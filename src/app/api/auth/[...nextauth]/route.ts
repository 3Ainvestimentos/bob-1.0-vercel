'use server';
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

const {
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
});

export { GET, POST, auth };
