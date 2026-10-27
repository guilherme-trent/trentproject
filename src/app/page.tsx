import type { Viewport } from 'next';
import { Portfolio } from '@/portfolio/Portfolio';

/** O portfólio é claro; o resto do site (a experiência 3D, a cidade) continua escuro, como no layout. */
export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
};

/** A página principal é o portfólio. A experiência 3D mora em /experiencia. */
export default function Home() {
  return <Portfolio />;
}
