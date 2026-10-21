'use client';

import { useEffect, useRef } from 'react';

/**
 * Faíscas flutuando ao fundo, como as brasas da Yggdrasil. Canvas 2D (não WebGL): leve até em
 * aparelho fraco. Elas sobem devagar, cintilam, se afastam do ponteiro e têm profundidade na rolagem.
 * Pausam com a aba escondida; com "movimento reduzido", ficam em menor número e bem mais lentas.
 */
export function Faiscas() {
  const tela = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = tela.current;
    if (!canvas) return;
    // Com "movimento reduzido": menos faíscas, bem mais lentas (reduzir, não eliminar)
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ritmo = calmo ? 0.35 : 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(1.5, devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    type Faisca = { x: number; y: number; z: number; r: number; vy: number; fase: number; ambar: boolean; dx: number; dy: number };
    let faiscas: Faisca[] = [];
    const ponteiro = { x: -9999, y: -9999 };

    // Um "sprite" de brilho desenhado uma vez e carimbado (bem mais barato que gradiente por partícula)
    const sprite = (cor: string) => {
      const s = document.createElement('canvas');
      s.width = s.height = 64;
      const c = s.getContext('2d')!;
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, cor);
      g.addColorStop(0.25, cor.replace('1)', '0.45)'));
      g.addColorStop(1, cor.replace('1)', '0)'));
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      return s;
    };
    const verde = sprite('rgba(167, 243, 208, 1)');
    const ambar = sprite('rgba(253, 186, 116, 1)');

    const medir = () => {
      w = innerWidth;
      h = innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const quantas = Math.min(calmo ? 45 : 90, Math.round((w * h) / (calmo ? 32000 : 16000)));
      faiscas = Array.from({ length: quantas }, () => nova(Math.random() * h));
    };
    const nova = (y: number): Faisca => ({
      x: Math.random() * w,
      y,
      z: 0.3 + Math.random() * 0.7, // profundidade: as mais perto são maiores, mais rápidas e mexem mais na rolagem
      r: 0,
      vy: 0,
      fase: Math.random() * Math.PI * 2,
      ambar: Math.random() < 0.18,
      dx: 0,
      dy: 0,
    });

    let anterior = performance.now();
    let quadro = 0;
    const desenhar = (agora: number) => {
      const dt = Math.min(0.05, (agora - anterior) / 1000) * ritmo;
      anterior = agora;
      ctx.clearRect(0, 0, w, h);
      const rolagem = scrollY;
      for (const f of faiscas) {
        f.fase += dt * (0.6 + f.z);
        f.y -= dt * (8 + 22 * f.z);
        f.x += Math.sin(f.fase * 0.7) * dt * 6 * f.z;
        // Afasta do ponteiro, e volta devagar
        const px = f.x + f.dx;
        const py = ((f.y - rolagem * 0.15 * f.z) % h + h) % h + f.dy;
        const ddx = px - ponteiro.x;
        const ddy = py - ponteiro.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < 14000) {
          const forca = (1 - d2 / 14000) * 40 * dt;
          f.dx += (ddx / Math.sqrt(d2 + 1)) * forca * 4;
          f.dy += (ddy / Math.sqrt(d2 + 1)) * forca * 4;
        }
        f.dx *= 0.96;
        f.dy *= 0.96;
        if (f.y < -20) Object.assign(f, nova(h + 20));
        const brilho = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(f.fase * 2.3), 3);
        const tam = (3 + 9 * f.z) * (0.7 + 0.3 * brilho);
        ctx.globalAlpha = (0.25 + 0.55 * f.z) * brilho;
        ctx.drawImage(f.ambar ? ambar : verde, px - tam / 2, py - tam / 2, tam, tam);
      }
      ctx.globalAlpha = 1;
      quadro = requestAnimationFrame(desenhar);
    };

    const aoMover = (e: PointerEvent) => {
      ponteiro.x = e.clientX;
      ponteiro.y = e.clientY;
    };
    const aoSair = () => {
      ponteiro.x = ponteiro.y = -9999;
    };
    const visibilidade = () => {
      cancelAnimationFrame(quadro);
      if (!document.hidden) {
        anterior = performance.now();
        quadro = requestAnimationFrame(desenhar);
      }
    };

    medir();
    quadro = requestAnimationFrame(desenhar);
    addEventListener('resize', medir);
    addEventListener('pointermove', aoMover, { passive: true });
    document.addEventListener('pointerleave', aoSair);
    document.addEventListener('visibilitychange', visibilidade);
    return () => {
      cancelAnimationFrame(quadro);
      removeEventListener('resize', medir);
      removeEventListener('pointermove', aoMover);
      document.removeEventListener('pointerleave', aoSair);
      document.removeEventListener('visibilitychange', visibilidade);
    };
  }, []);

  return <canvas ref={tela} aria-hidden="true" className="faiscas" />;
}
