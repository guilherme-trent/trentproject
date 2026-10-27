'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import type { Imagem } from './conteudo';

const n2 = (i: number) => String(i + 1).padStart(2, '0');

/**
 * As telas de um projeto na foto da ficha, uma por vez. É a rolagem nativa do navegador com scroll-snap:
 * no celular e no trackpad é só arrastar para o lado (sem biblioteca nem cálculo de arrasto); no PC, as setas
 * aparecem ao passar o mouse, e os pontos levam direto a uma tela. Do fim, a seta volta ao começo.
 * Só a capa carrega junto com a página; as outras telas chegam quando o carrossel se aproxima da tela.
 */
export function Carrossel({ imagens, nome }: { imagens: Imagem[]; nome: string }) {
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const total = imagens.length;

  const ir = (i: number) => {
    const t = trilho.current;
    if (!t) return;
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
    t.scrollTo({ left: ((i + total) % total) * t.clientWidth, behavior: calmo ? 'auto' : 'smooth' });
  };
  const aoRolar = () => {
    const t = trilho.current;
    if (t) setAtual(Math.round(t.scrollLeft / t.clientWidth));
  };

  return (
    <div className="carrossel" role="region" aria-roledescription="carrossel" aria-label={`Telas de ${nome}`}>
      <div className="trilho" ref={trilho} onScroll={aoRolar} tabIndex={total > 1 ? 0 : -1}>
        {imagens.map((img, i) => (
          <figure key={img.src} className="slide" aria-roledescription="slide" aria-label={`${i + 1} de ${total}`}>
            <Image src={img.src} alt={img.alt} fill sizes="(min-width: 981px) 45vw, 100vw" />
          </figure>
        ))}
      </div>
      {total > 1 && (
        <>
          <button type="button" className="seta anterior chanfro" aria-label="Tela anterior" onClick={() => ir(atual - 1)}>←</button>
          <button type="button" className="seta proxima chanfro" aria-label="Próxima tela" onClick={() => ir(atual + 1)}>→</button>
          <div className="rodape-carrossel mono">
            <span className="legenda" aria-live="polite">{imagens[atual]?.legenda}</span>
            <span className="pontos">
              {imagens.map((img, i) => (
                <button key={img.src} type="button" aria-label={`Ir para a tela ${i + 1}`} aria-current={i === atual} onClick={() => ir(i)} />
              ))}
            </span>
            <span className="contador">{n2(atual)} / {String(total).padStart(2, '0')}</span>
          </div>
        </>
      )}
    </div>
  );
}
