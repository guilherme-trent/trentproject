'use client';

import { useEffect, useRef } from 'react';

const quatro = (n: number) => String(Math.max(0, Math.round(n))).padStart(4, '0');

/**
 * As coordenadas do cursor no topo, como a leitura de uma prancheta: "X 0742 · Y 0318", em pixels a partir
 * do canto do topo. Escreve direto no DOM (sem re-renderizar o React a cada movimento). Em tela de toque
 * não há cursor: fica a leitura parada.
 */
export function Coordenadas() {
  const leitura = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const topo = leitura.current?.closest<HTMLElement>('.topo');
    if (!topo || !leitura.current) return;
    let quadro = 0;
    const aoMover = (e: PointerEvent) => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const r = topo.getBoundingClientRect();
        if (leitura.current) leitura.current.textContent = `X ${quatro(e.clientX - r.left)} · Y ${quatro(e.clientY - r.top)}`;
      });
    };
    topo.addEventListener('pointermove', aoMover, { passive: true });
    return () => {
      topo.removeEventListener('pointermove', aoMover);
      cancelAnimationFrame(quadro);
    };
  }, []);

  return (
    <p className="coordenadas mono" aria-hidden="true">
      <span className="mira" /><span ref={leitura}>X 0000 · Y 0000</span>
    </p>
  );
}
