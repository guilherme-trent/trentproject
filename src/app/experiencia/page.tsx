import type { Metadata } from 'next';
import { CanvasLayer } from '@/engine/canvas/CanvasLayer';
import { UIOverlay } from '@/ui/UIOverlay';

export const metadata: Metadata = {
  title: "The Orchestrator · experiência 3D",
  description: 'A jornada interativa em 3D de Guilherme Trent: arquitetura, desempenho e experiência, direto no navegador.',
};

/**
 * Composição da experiência 3D (The Orchestrator's Canvas), em /experiencia.
 *
 * Esta página é um Server Component: o HTML inicial (fundo preto + overlay de
 * loading) chega pronto do servidor, e o motor 3D é hidratado depois como
 * chunk assíncrono. Duas camadas independentes, ligadas apenas pelo store:
 *
 *   z-0  CanvasLayer — WebGL em tela cheia (client-only)
 *   z-10 UIOverlay   — HTML/Tailwind/Framer Motion
 */
export default function Experiencia() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-black">
      <CanvasLayer />
      <UIOverlay />
    </main>
  );
}
