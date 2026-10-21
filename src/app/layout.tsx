import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** A voz da Yggdrasil: serifa clássica, itálico leve — o tom de inscrição antiga. */
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
});

const DESCRICAO =
  'Software Engineer e Technical Product Manager em Brasília. Projetos, experiência e uma jornada interativa em 3D.';

export const metadata: Metadata = {
  metadataBase: new URL('https://guilhermetrent.com.br'),
  title: { default: 'Guilherme Trent · Software Engineer', template: '%s · Guilherme Trent' },
  description: DESCRICAO,
  authors: [{ name: 'Guilherme Trent' }],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Guilherme Trent',
    title: 'Guilherme Trent · Software Engineer',
    description: DESCRICAO,
  },
  twitter: { card: 'summary_large_image', title: 'Guilherme Trent · Software Engineer', description: DESCRICAO },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} h-full bg-black antialiased`}
      // O portfólio põe classes aqui antes de o React acordar ("com-js", para as animações de entrada não
      // piscarem) e depois ao rolar ("rolou"). A diferença com o HTML do servidor é intencional.
      suppressHydrationWarning
    >
      {/* A rolagem é liberada aqui; a experiência 3D trava a dela no próprio layout (app/experiencia/layout.tsx). */}
      <body className="min-h-full bg-black text-white">{children}</body>
    </html>
  );
}
