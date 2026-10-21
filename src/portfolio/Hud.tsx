'use client';

import { useEffect, useRef } from 'react';

/**
 * O topo como painel de controle: a telemetria ao vivo
 * (hora de Brasília, quadros por segundo medidos de verdade, tempo desde que a página abriu e um
 * fluxo de dados). De tempos em tempos, o nome sofre um glitch de sinal.
 * Tudo escreve direto no DOM (textContent), sem re-renderizar o React a cada quadro.
 */
export function Telemetria() {
  const hora = useRef<HTMLSpanElement>(null);
  const fps = useRef<HTMLSpanElement>(null);
  const ativo = useRef<HTMLSpanElement>(null);
  const fluxo = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const relogio = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const inicio = performance.now();
    const hex = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0')).join(' ');

    const aCadaSegundo = () => {
      if (hora.current) hora.current.textContent = relogio.format(new Date());
      const s = Math.floor((performance.now() - inicio) / 1000);
      if (ativo.current) ativo.current.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    aCadaSegundo();
    const segundos = setInterval(aCadaSegundo, 1000);
    const dados = window.setInterval(() => { if (fluxo.current) fluxo.current.textContent = hex(); }, calmo ? 600 : 140);

    // Quadros por segundo de verdade, medidos a cada meio segundo
    let quadros = 0;
    let marco = performance.now();
    let raf = 0;
    const contar = (agora: number) => {
      quadros++;
      if (agora - marco >= 500) {
        if (fps.current) fps.current.textContent = String(Math.min(240, Math.round((quadros * 1000) / (agora - marco))));
        quadros = 0;
        marco = agora;
      }
      raf = requestAnimationFrame(contar);
    };
    raf = requestAnimationFrame(contar);

    // O glitch de sinal no nome, a cada 6 a 10 segundos
    const nome = document.querySelector<HTMLElement>('.topo h1');
    let glitch = 0;
    const agendar = () => {
      glitch = window.setTimeout(() => {
        nome?.classList.add('glitch');
        window.setTimeout(() => nome?.classList.remove('glitch'), 420);
        agendar();
      }, 6000 + Math.random() * 4000);
    };
    if (!calmo) agendar();

    return () => {
      clearInterval(segundos);
      clearInterval(dados);
      clearTimeout(glitch);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div className="telemetria telemetria-alto" aria-hidden="true">
        <p><span className="ponto-vivo" /> SINAL ESTÁVEL</p>
        <p>BRASÍLIA <span ref={hora}>--:--:--</span></p>
        <p>15°47′S · 47°52′W</p>
      </div>
      <div className="telemetria telemetria-baixo" aria-hidden="true">
        <p>REGENTE · <span ref={fps}>--</span> QPS</p>
        <p>SESSÃO <span ref={ativo}>00:00</span></p>
        <p className="fluxo"><span ref={fluxo}>0000 0000 0000 0000</span></p>
      </div>
    </>
  );
}
