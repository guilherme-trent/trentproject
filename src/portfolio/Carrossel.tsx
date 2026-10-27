'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { Imagem } from './conteudo';

const n2 = (i: number) => String(i + 1).padStart(2, '0');

/** Tempo de cada tela na passagem sozinha (mais longo com movimento reduzido). */
const INTERVALO = 6000;
const INTERVALO_CALMO = 9000;
/** Duração da passagem de uma tela para a outra. */
const PASSAGEM = 950;

const suave = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2); // ease-in-out cúbica

/**
 * As telas de um projeto na foto da ficha, uma por vez. A base é a rolagem nativa com scroll-snap: no celular
 * e no trackpad é só arrastar para o lado. No PC, as setas aparecem ao passar o mouse, e os pontos levam direto
 * a uma tela.
 *
 * A passagem (setas, pontos e a troca automática) é animada aqui, e não pelo `behavior: 'smooth'` do navegador,
 * que é rápido demais e não deixa escolher a duração. Durante a animação o encaixe fica desligado, senão ele
 * briga com o movimento.
 *
 * Esteira sem volta: depois da última tela vem uma cópia da primeira. A passagem chega nela e, parada, o
 * carrossel pula sem ninguém ver para a primeira de verdade. Para trás, o caminho é o inverso: pula para a
 * cópia e anda até a última.
 *
 * As telas também passam sozinhas, a cada 6 s (9 s com movimento reduzido), mas só com a ficha na tela e a aba
 * à vista. Param enquanto o mouse está em cima ou o teclado está dentro, e quem mexe (seta, ponto, arrasto)
 * ganha um tempo a mais antes da próxima troca. Cada carrossel começa num tempo diferente, para as fichas
 * não trocarem todas juntas. Só a capa carrega junto com a página; as outras telas chegam quando o
 * carrossel se aproxima da tela.
 */
export function Carrossel({ imagens, nome }: { imagens: Imagem[]; nome: string }) {
  const raiz = useRef<HTMLDivElement>(null);
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const animacao = useRef(0);
  const parada = useRef(0);
  const sobOMouse = useRef(false);
  const proxima = useRef(0);
  const total = imagens.length;

  /** Parado na cópia da primeira tela: troca, sem animação, pela primeira de verdade. */
  const desdobrar = () => {
    const t = trilho.current;
    if (t && !animacao.current && Math.round(t.scrollLeft / t.clientWidth) >= total) t.scrollLeft = 0;
  };

  const pararAnimacao = () => {
    cancelAnimationFrame(animacao.current);
    animacao.current = 0;
    if (trilho.current) trilho.current.style.scrollSnapType = '';
  };

  /** Anda até a tela `destino` (0 a total, onde total é a cópia da primeira). */
  const animarAte = (destino: number) => {
    const t = trilho.current;
    if (!t) return;
    pararAnimacao();
    const de = t.scrollLeft;
    const ate = destino * t.clientWidth;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      t.scrollLeft = ate;
      desdobrar();
      return;
    }
    t.style.scrollSnapType = 'none';
    const inicio = performance.now();
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / PASSAGEM);
      t.scrollLeft = de + (ate - de) * suave(p);
      if (p < 1) animacao.current = requestAnimationFrame(passo);
      else {
        pararAnimacao();
        desdobrar();
      }
    };
    animacao.current = requestAnimationFrame(passo);
  };

  /** A tela em que o trilho está agora (a cópia conta como a primeira). */
  const posicao = () => {
    const t = trilho.current;
    return t ? Math.round(t.scrollLeft / t.clientWidth) % total : 0;
  };

  // quem mexe ganha tempo: a próxima troca automática fica para depois
  const adiar = () => { proxima.current = performance.now() + INTERVALO * 2; };

  const ir = (i: number) => {
    adiar();
    const t = trilho.current;
    if (!t) return;
    if (i < 0) {
      // da primeira para trás: pula para a cópia e anda até a última
      pararAnimacao();
      t.scrollLeft = total * t.clientWidth;
      animarAte(total - 1);
    } else if (i === 0 && posicao() === total - 1) animarAte(total); // da última para a primeira: segue em frente
    else animarAte(i);
  };

  const aoRolar = () => {
    setAtual(posicao());
    // arrasto que terminou na cópia: desdobra quando a rolagem parar
    clearTimeout(parada.current);
    parada.current = window.setTimeout(desdobrar, 160);
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
      animarAte(Math.round(t.scrollLeft / t.clientWidth) + 1);
    }, 250);
    return () => {
      clearInterval(relogio);
      vista.disconnect();
      cancelAnimationFrame(animacao.current);
    };
    // animarAte só usa refs; recriar o relógio a cada render reiniciaria a contagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // a cópia da primeira tela fecha a esteira (escondida do leitor de tela)
  const slides = total > 1 ? [...imagens, imagens[0]] : imagens;

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
      <div
        className="trilho"
        ref={trilho}
        onScroll={aoRolar}
        onPointerDown={() => { adiar(); pararAnimacao(); }}
        onWheel={adiar}
        tabIndex={total > 1 ? 0 : -1}
      >
        {slides.map((img, i) => {
          const copia = i === total;
          return (
            <figure
              key={copia ? 'copia' : img.src}
              className="slide"
              aria-hidden={copia || undefined}
              aria-roledescription={copia ? undefined : 'slide'}
              aria-label={copia ? undefined : `${i + 1} de ${total}`}
            >
              <Image src={img.src} alt={copia ? '' : img.alt} fill sizes="(min-width: 981px) 45vw, 100vw" />
            </figure>
          );
        })}
      </div>
      {total > 1 && (
        <>
          <button type="button" className="seta anterior chanfro" aria-label="Tela anterior" onClick={() => ir(posicao() - 1)}>←</button>
          <button type="button" className="seta proxima chanfro" aria-label="Próxima tela" onClick={() => ir(posicao() + 1)}>→</button>
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
