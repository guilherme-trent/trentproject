'use client';

import { useEffect, useRef } from 'react';
import { LABORATORIO } from '@/portfolio/conteudo';
import { iniciarCidade } from './motor';
import '@/portfolio/portfolio.css';
import './cidade.css';

const { cidade } = LABORATORIO;

/**
 * A descida pela cidade: um trecho alto da página com o palco preso na tela (sticky). O motor desenha
 * no canvas e escreve direto no DOM (telemetria, texto), sem re-renderizar o React a cada quadro.
 */
export function Cidade() {
  const topo = useRef<HTMLElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const texto = useRef<HTMLDivElement>(null);
  const role = useRef<HTMLParagraphElement>(null);
  const altitude = useRef<HTMLSpanElement>(null);
  const qps = useRef<HTMLSpanElement>(null);
  const trafego = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!topo.current || !palco.current || !tela.current) return;
    return iniciarCidade({
      topo: topo.current, palco: palco.current, tela: tela.current, texto: texto.current,
      role: role.current, altitude: altitude.current, qps: qps.current, trafego: trafego.current,
    });
  }, []);

  return (
    <section ref={topo} className="cidade-topo" aria-labelledby="titulo-cidade">
      <div ref={palco} className="cidade-palco">
        <canvas ref={tela} className="cidade-tela" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/#laboratorio" className="cidade-saida">
          ← Guilherme Trent <span>·</span> portfólio
        </a>
        <div className="telemetria telemetria-alto" aria-hidden="true">
          <p><span className="ponto-vivo" /> SINAL ESTÁVEL</p>
          <p>SETOR 07 · CHUVA FINA</p>
          <p>ALTITUDE <span ref={altitude}>312</span> m</p>
        </div>
        <div className="telemetria telemetria-baixo" aria-hidden="true">
          <p>CANVAS 2D · <span ref={qps}>--</span> QPS</p>
          <p>TRÁFEGO <span ref={trafego}>--</span> VEÍCULOS</p>
        </div>
        <div ref={texto} className="cidade-texto mx-auto w-full max-w-6xl px-5 sm:px-8">
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.32em] text-[var(--verde-claro)]">{cidade.selo}</p>
          <h1 id="titulo-cidade" className="mt-4 font-serif text-[clamp(3rem,7vw,5.6rem)] font-light leading-[0.95]">{cidade.nome}</h1>
          <p className="mt-6 max-w-xl text-[clamp(1.02rem,1.5vw,1.2rem)] leading-relaxed text-[var(--texto-suave)]">{cidade.proposta}</p>
        </div>
        <p ref={role} className="cidade-role" aria-hidden="true">ROLE PARA DESCER ↓</p>
      </div>
    </section>
  );
}
