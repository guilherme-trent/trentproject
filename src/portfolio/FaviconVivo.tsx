'use client';

import { useEffect } from 'react';

const LADO = 32; // a aba usa 16 px; desenhar em 32 deixa nítido em tela densa
const U = 2;     // 1 unidade da grade de 16 = 2 px
const VERDE = '#1FA35C';
const TINTA = '#0C0C0E';

/** O ícone do site (o código de barras), com o feixe de leitura numa coluna da grade e o quadrado verde aceso ou não. */
function desenhar(ctx: CanvasRenderingContext2D, feixe: number | null, quadrado: boolean) {
  ctx.clearRect(0, 0, LADO, LADO);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(12 * U, 0);
  ctx.lineTo(16 * U, 4 * U);
  ctx.lineTo(16 * U, 16 * U);
  ctx.lineTo(4 * U, 16 * U);
  ctx.lineTo(0, 12 * U);
  ctx.closePath();
  ctx.fillStyle = TINTA;
  ctx.fill();
  ctx.fillStyle = '#fff';
  for (const [x0, x1] of [[3, 5], [6, 7], [8, 10]]) ctx.fillRect(x0 * U, 3 * U, (x1 - x0) * U, 10 * U);
  ctx.fillStyle = VERDE;
  if (quadrado) ctx.fillRect(11 * U, 10 * U, 2 * U, 3 * U);
  if (feixe !== null) ctx.fillRect(feixe * U, 2 * U, U, 12 * U);
}

/**
 * O ícone da aba vivo, como o código de barras sendo lido:
 *  - com a página na tela: a cada 8 a 12 s, um feixe verde atravessa as barras e o quadrado pisca duas vezes;
 *  - com a aba em segundo plano (quando o ícone mais aparece): só o quadrado apaga de leve a cada 5 s. O
 *    navegador deixa a página atualizar no máximo uma vez por segundo ali, então uma animação rápida não daria.
 * Com movimento reduzido, fica só a piscada lenta. Entre uma animação e outra, volta o favicon.ico original.
 */
export function FaviconVivo() {
  useEffect(() => {
    const tela = document.createElement('canvas');
    tela.width = tela.height = LADO;
    const ctx = tela.getContext('2d');
    if (!ctx) return;
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // As tags de ícone são buscadas a cada quadro: o Next acrescenta algumas depois de a página carregar.
    // O endereço original fica guardado na própria tag (data-original), para voltar entre uma animação e outra.
    const icones = () => [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];
    const mostrar = (feixe: number | null, quadrado: boolean) => {
      desenhar(ctx, feixe, quadrado);
      const url = tela.toDataURL('image/png');
      for (const l of icones()) {
        l.dataset.original ??= l.href;
        l.href = url;
      }
    };
    const restaurar = () => { for (const l of icones()) if (l.dataset.original) l.href = l.dataset.original; };

    let relogio = 0;
    const depois = (ms: number, f: () => void) => { relogio = window.setTimeout(f, ms); };

    // cada passo: [feixe, quadrado aceso, quanto dura]
    const leitura: [number | null, boolean, number][] = [
      ...Array.from({ length: 12 }, (_, i): [number, boolean, number] => [i + 2, true, 60]),
      [null, false, 120], [null, true, 120], [null, false, 120],
    ];
    const tocar = (passos: [number | null, boolean, number][], fim: () => void) => {
      const [feixe, quadrado, ms] = passos[0];
      mostrar(feixe, quadrado);
      depois(ms, () => (passos.length > 1 ? tocar(passos.slice(1), fim) : (restaurar(), fim())));
    };

    const agendar = () => {
      if (document.hidden || calmo) depois(5000, () => tocar([[null, false, 1000]], agendar));
      else depois(8000 + Math.random() * 4000, () => tocar(leitura, agendar));
    };
    // ao trocar de aba, recomeça no ritmo certo para o novo estado
    const aoTrocar = () => { clearTimeout(relogio); restaurar(); agendar(); };
    document.addEventListener('visibilitychange', aoTrocar);
    agendar();

    return () => {
      clearTimeout(relogio);
      document.removeEventListener('visibilitychange', aoTrocar);
      restaurar();
    };
  }, []);

  return null;
}
