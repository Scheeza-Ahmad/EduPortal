import type { Metadata } from 'next';
import { Inter, Noto_Nastaliq_Urdu } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { LanguageProvider } from '@/lib/LanguageContext';
import { BrandingProvider } from '@/lib/BrandingContext';
import { FeaturesProvider } from '@/lib/FeaturesContext';
import { KeepAlive } from '@/components/keep-alive';

const inter = Inter({ subsets: ['latin'] });
const notoNastaliqUrdu = Noto_Nastaliq_Urdu({ subsets: ['arabic'], variable: '--font-urdu' });

export const metadata: Metadata = {
  title: 'EduPortal',
  description: 'School management portal',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${notoNastaliqUrdu.variable}`}>
        <BrandingProvider>
          <FeaturesProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <LanguageProvider>
                <KeepAlive />
                {children}
                <Toaster richColors position="top-right" />
              </LanguageProvider>
            </ThemeProvider>
          </FeaturesProvider>
        </BrandingProvider>
      </body>
    </html>
  );
}
