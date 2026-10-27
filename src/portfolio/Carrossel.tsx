'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { Imagem } from './conteudo';

const n2 = (i: number) => String(i + 1).padStart(2, '0');

/** Tempo de cada tela na passagem sozinha (mais longo com movimento reduzido). */
const INTERVALO = 6000;
const INTERVALO_CALMO = 9000;

function rolarPara(t: HTMLDivElement, i: number, total: number) {
  const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
  t.scrollTo({ left: ((i + total) % total) * t.clientWidth, behavior: calmo ? 'auto' : 'smooth' });
}

/**
 * As telas de um projeto na foto da ficha, uma por vez. É a rolagem nativa do navegador com scroll-snap:
 * no celular e no trackpad é só arrastar para o lado (sem biblioteca nem cálculo de arrasto); no PC, as setas
 * aparecem ao passar o mouse, e os pontos levam direto a uma tela. Do fim, volta ao começo.
 * Só a capa carrega junto com a página; as outras telas chegam quando o carrossel se aproxima da tela.
 *
 * As telas também passam sozinhas, a cada 6 s (9 s com movimento reduzido), mas só com a ficha na tela e a aba
 * à vista. Param enquanto o mouse está em cima ou o teclado está dentro, e quem mexe (seta, ponto, arrasto)
 * ganha um tempo a mais antes da próxima troca. Cada carrossel começa num tempo diferente, para as fichas
 * não trocarem todas juntas.
 */
export function Carrossel({ imagens, nome }: { imagens: Imagem[]; nome: string }) {
  const raiz = useRef<HTMLDivElement>(null);
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const atualRef = useRef(0);
  const sobOMouse = useRef(false);
  const proxima = useRef(0);
  const total = imagens.length;

  // quem mexe ganha tempo: a próxima troca automática fica para depois
  const adiar = () => { proxima.current = performance.now() + INTERVALO * 2; };
  const ir = (i: number) => {
    adiar();
    if (trilho.current) rolarPara(trilho.current, i, total);
  };
  const aoRolar = () => {
    const t = trilho.current;
    if (!t) return;
    atualRef.current = Math.round(t.scrollLeft / t.clientWidth);
    setAtual(atualRef.current);
  };

  useEffect(() => {
    const el = raiz.current;
    const t = trilho.current;
    if (!el || !t || total < 2) return;
    const intervalo = matchMedia('(prefers-reduced-motion: reduce)').matches ? INTERVALO_CALMO : INTERVALO;
    let visivel = false;
    const vista = new IntersectionObserver(([e]) => { visivel = e.isIntersecting; }, { threshold: 0.6 });
    vista.observe(el);
    proxima.current = performance.now() + intervalo + Math.random() * 2500;
    const relogio = window.setInterval(() => {
      const agora = performance.now();
      if (!visivel || document.hidden || sobOMouse.current || el.querySelector(':focus-visible')) {
        // parado: ao voltar, a tela ainda fica um pouco antes de trocar
        proxima.current = Math.max(proxima.current, agora + intervalo / 2);
        return;
      }
      if (agora < proxima.current) return;
      proxima.current = agora + intervalo;
      rolarPara(t, atualRef.current + 1, total);
    }, 250);
    return () => {
      clearInterval(relogio);
      vista.disconnect();
    };
  }, [total]);

  return (
    <div
      ref={raiz}
      className="carrossel"
      role="region"
      aria-roledescription="carrossel"
      aria-label={`Telas de ${nome}`}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') sobOMouse.current = true; }}
      onPointerLeave={() => { sobOMouse.current = false; }}
    >
      <div className="trilho" ref={trilho} onScroll={aoRolar} onPointerDown={adiar} onWheel={adiar} tabIndex={total > 1 ? 0 : -1}>
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
            <span className="legenda">{imagens[atual]?.legenda}</span>
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
