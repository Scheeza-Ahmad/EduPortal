import type { Metadata } from 'next';
import { Inter, Noto_Nastaliq_Urdu } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import { SWRConfig } from 'swr';
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
        {/* Every SWR hook in the app shares this config. revalidateOnFocus
            is off — without it, every hook re-fetches the instant the
            browser tab regains focus, which reads as the whole page
            reloading; the cache still revalidates on reconnect/mount, this
            just stops the "flash of stale-then-fresh" on tab-switch. A
            short dedupingInterval means rapid remounts of the same page
            (e.g. clicking the same nav link twice) reuse the in-flight
            request instead of firing a second one. */}
        <SWRConfig
          value={{
            revalidateOnFocus: false,
            dedupingInterval: 5000,
          }}
        >
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
        </SWRConfig>
      </body>
    </html>
  );
}
