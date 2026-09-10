import type { Metadata, Viewport } from 'next';
import { Grenze, Alegreya_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const display = Grenze({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const body = Alegreya_Sans({
  subsets: ['latin', 'cyrillic', 'latin-ext'],
  weight: ['400', '500', '700'],
  variable: '--font-body',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'http://localhost:3000'),
  ),
  title: 'HOLLOWMERE',
  description: 'the curse never checked out.',
  openGraph: {
    title: 'HOLLOWMERE',
    description: 'the curse never checked out.',
    images: ['/clips/sanctum/poster/00_idle.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HOLLOWMERE',
    description: 'the curse never checked out.',
    images: ['/clips/sanctum/poster/00_idle.jpg'],
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0a10',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
