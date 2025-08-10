import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import AuthProvider from '@/context/AuthProvider';
import { ThemeProvider } from '@/components/theme-provider';

const archivo = Archivo({ 
  subsets: ['latin'], 
  variable: '--font-sans',
  weight: ['300', '400', '500', '600', '700'] 
});

export const metadata: Metadata = {
  title: 'DataVisor',
  description: 'Assistente de IA Generativa',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={archivo.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
              {children}
              <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
