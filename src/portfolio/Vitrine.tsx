'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { Projeto } from './conteudo';

const TEMPO = 5200; // quanto cada projeto fica no ar

/**
 * A vitrine: uma tela holográfica que troca de projeto sozinha, com transição de glitch, linhas de
 * varredura e uma barra de tempo. Clicar escolhe o projeto (e o relógio recomeça). Só roda enquanto está
 * na tela. Com "movimento reduzido", a troca é um esmaecer suave, sem o glitch.
 */
export function Vitrine({ projetos }: { projetos: Projeto[] }) {
  const [atual, setAtual] = useState(0);
  const [rodada, setRodada] = useState(0); // recomeça a barra de tempo quando a pessoa escolhe
  const raiz = useRef<HTMLDivElement>(null);
  const visivel = useRef(false);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const observador = new IntersectionObserver(([e]) => {
      visivel.current = e.isIntersecting;
      el.classList.toggle('no-ar', e.isIntersecting);
    }, { threshold: 0.25 });
    observador.observe(el);
    const relogio = setInterval(() => {
      if (visivel.current && !document.hidden) setAtual((i) => (i + 1) % projetos.length);
    }, TEMPO);
    return () => {
      observador.disconnect();
      clearInterval(relogio);
    };
  }, [projetos.length, rodada]);

  const escolher = (i: number) => {
    setAtual(i);
    setRodada((r) => r + 1);
  };
  const p = projetos[atual];

  return (
    <div ref={raiz} className="vitrine cantos" style={{ '--tempo': `${TEMPO}ms` } as React.CSSProperties}>
      <div className="vitrine-tela">
        {/* Todas as telas ficam carregadas; só a atual aparece (a troca é instantânea, sem esperar rede) */}
        {projetos.map((proj, i) => (
          <div key={proj.id} className={`vitrine-quadro ${i === atual ? 'atual' : ''}`} aria-hidden={i !== atual}>
            <Image src={proj.imagem.src} alt={proj.imagem.alt} fill quality={90} sizes="(min-width: 1152px) 720px, (min-width: 768px) 62vw, 100vw" className="object-cover" />
          </div>
        ))}
        <div className="vitrine-varredura" aria-hidden="true" />
        {/* A legenda da transmissão: o projeto no ar */}
        <div key={p.id} className="vitrine-legenda">
          <span>{p.selo}</span>
          <strong>{p.nome}</strong>
        </div>
        <div className="vitrine-rotulos" aria-hidden="true">
          <span><i className="ponto-vivo ponto-alerta" /> TRANSMISSÃO AO VIVO</span>
          <span>CANAL {String(atual + 1).padStart(2, '0')}/{String(projetos.length).padStart(2, '0')}</span>
        </div>
      </div>
      <div className="vitrine-lado">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--verde-claro)]">Em exibição</p>
        <ol className="vitrine-lista mt-4" aria-label="Projetos na vitrine">
          {projetos.map((proj, i) => (
            <li key={proj.id}>
              <button type="button" onClick={() => escolher(i)} className={i === atual ? 'atual' : ''} aria-current={i === atual}>
                <span className="font-mono text-[0.68rem] text-[var(--texto-fraco)]">{String(i + 1).padStart(2, '0')}</span>
                <span>{proj.nome}</span>
                {i === atual && <i key={`${atual}-${rodada}`} className="vitrine-tempo" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-auto pt-5 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--texto-fraco)]">
          Troca sozinha a cada 5 s · toque num canal para escolher
        </p>
      </div>
    </div>
  );
}
