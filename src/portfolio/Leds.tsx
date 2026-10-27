'use client';

import { useEffect, useRef } from 'react';

/** Os acesos de partida: sempre os mesmos, para o HTML do servidor bater com o do navegador. */
const ACESOS = new Set([0, 3, 4, 9, 12, 16, 17, 21, 25, 28]);

/**
 * A matriz de status do topo: 30 quadradinhos, alguns acesos. De tempos em tempos um deles troca de estado,
 * como um painel de sistema vivo. Para com a aba em segundo plano; com movimento reduzido, troca mais devagar.
 */
export function Leds() {
  const grade = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const relogio = setInterval(() => {
      if (document.hidden || !grade.current) return;
      const leds = grade.current.children;
      leds[Math.floor(Math.random() * leds.length)].classList.toggle('aceso');
    }, calmo ? 2400 : 900);
    return () => clearInterval(relogio);
  }, []);

  return (
    <span ref={grade} className="leds" aria-hidden="true">
      {Array.from({ length: 30 }, (_, i) => (
        <i key={i} className={ACESOS.has(i) ? 'aceso' : undefined} />
      ))}
    </span>
  );
}
