import type { CSSProperties } from 'react';

/*
 * As peças de "sistema" da página, desenhadas no servidor: código de barras e régua. Saem sempre iguais
 * (semente fixa), então o HTML do servidor e o do navegador batem.
 */

function sorteio(semente: number) {
  let s = semente;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

/** Código de barras decorativo: `barras` traços finos e grossos, alguns mais altos. */
export function Barras({ barras, altura, semente = 7, className, style }: { barras: number; altura: number; semente?: number; className?: string; style?: CSSProperties }) {
  const aleatorio = sorteio(semente);
  const tracos = Array.from({ length: barras }, () => ({ largura: aleatorio() < 0.3 ? 4 : 2, alto: aleatorio() < 0.2 }));
  return (
    <span className={`barras ${className ?? ''}`} style={style} aria-hidden="true">
      {tracos.map((t, i) => (
        <i key={i} style={{ width: t.largura, height: t.alto ? altura : altura * 0.72 }} />
      ))}
    </span>
  );
}

/** Régua: um traço a cada `passo` px, maior a cada 5 e a cada 10. */
export function Regua({ tracos, passo, altura, className }: { tracos: number; passo: number; altura: number; className?: string }) {
  return (
    <span className={`regua ${className ?? ''}`} style={{ gap: passo - 1 }} aria-hidden="true">
      {Array.from({ length: tracos }, (_, i) => (
        <i key={i} style={{ height: i % 10 === 0 ? altura : i % 5 === 0 ? altura * 0.6 : altura * 0.35 }} />
      ))}
    </span>
  );
}
