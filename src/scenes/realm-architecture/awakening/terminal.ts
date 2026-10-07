import { INTERCEPT } from './config';

/**
 * O terminal da interceptação é desenhado num Canvas2D e mostrado no WebGL
 * (não em HTML): no fim a TELA INTEIRA estilhaça, e só o que está no
 * framebuffer pode ser capturado. Um botão HTML invisível fica exatamente
 * sobre o "[ Voltar agora ]" desenhado — mesmo layout, uma fonte de verdade.
 *
 * Tudo em pixels CSS do viewport, origem no canto superior esquerdo.
 */
export const SPEAKER = 'Guilherme Trent:';
export const BACK_LABEL = '[ Voltar agora ]';

export interface TerminalLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  pad: number;
  font: number;
  line: number;
  /** Topo da primeira fala (relativo ao painel). */
  linesTop: number;
  /** O botão, relativo ao painel. */
  button: { x: number; y: number; w: number; h: number };
}

export function terminalLayout(viewW: number, viewH: number): TerminalLayout {
  const compact = viewW < 560 || viewH < 520;
  const font = compact ? 14 : 17;
  const line = Math.round(font * 1.75);
  const pad = compact ? 20 : 30;
  const w = Math.min(620, viewW - 32);
  const header = Math.round(font * 3.2);
  const linesTop = pad + header;
  const button = { w: Math.min(w - pad * 2, font * 15), h: Math.round(font * 3), x: 0, y: 0 };
  const h = linesTop + INTERCEPT.length * line + font * 1.6 + button.h + pad;
  button.x = Math.round((w - button.w) / 2);
  button.y = Math.round(h - pad - button.h);
  return { x: Math.round((viewW - w) / 2), y: Math.round(Math.max(16, (viewH - h) / 2)), w, h, pad, font, line, linesTop, button };
}

/** Faixa (px do painel) da fala `index`. */
export const lineBand = (layout: TerminalLayout, index: number) => ({
  top: layout.linesTop + index * layout.line,
  bottom: layout.linesTop + (index + 1) * layout.line,
});

let monoFamily = '';
function mono() {
  if (!monoFamily) {
    const variable = getComputedStyle(document.documentElement).getPropertyValue('--font-geist-mono').trim();
    monoFamily = variable ? `${variable}, ui-monospace, Menlo, monospace` : 'ui-monospace, Menlo, monospace';
  }
  return monoFamily;
}

/** Largura de um caractere monoespaçado na fonte do terminal (px CSS). */
export function charWidth(ctx: CanvasRenderingContext2D, layout: TerminalLayout) {
  ctx.font = `${layout.font}px ${mono()}`;
  return ctx.measureText('M').width;
}

/**
 * Desenha o painel com as `lines` primeiras falas (a digitação da última é
 * revelada pelo shader, sem novo upload) e o botão quando `ready`.
 * Paleta de terminal invadido: fundo quase preto, carmim do invasor sobre a
 * moldura esmeralda do reino.
 */
export function drawTerminal(ctx: CanvasRenderingContext2D, layout: TerminalLayout, scale: number, lines: number, ready: boolean) {
  const { w, h, pad, font } = layout;
  const family = mono();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(3, 6, 5, 0.94)';
  ctx.fillRect(0, 0, w, h);
  // Linhas de varredura gravadas no próprio painel (zero custo no shader).
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

  ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  // Moldura brutalista: cantos reforçados.
  ctx.fillStyle = 'rgba(52, 211, 153, 0.9)';
  for (const [cx, cy] of [[0, 0], [w - 10, 0], [0, h - 3], [w - 10, h - 3]]) ctx.fillRect(cx, cy, 10, 3);

  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(font * 0.62)}px ${family}`;
  ctx.fillStyle = 'rgba(248, 113, 113, 0.8)';
  ctx.fillText('▲ SINAL INTERCEPTADO · CANAL NÃO AUTORIZADO', pad, pad * 0.75 + 4);

  ctx.font = `600 ${Math.round(font * 1.12)}px ${family}`;
  ctx.fillStyle = '#fecaca';
  ctx.fillText(SPEAKER, pad, pad + font * 1.7);

  ctx.font = `${font}px ${family}`;
  ctx.fillStyle = '#e5e7eb';
  for (let i = 0; i < lines; i++) {
    const band = lineBand(layout, i);
    ctx.fillStyle = i === lines - 1 ? '#f5f5f4' : 'rgba(229, 231, 235, 0.62)';
    ctx.fillText(`> ${INTERCEPT[i].text}`, pad, (band.top + band.bottom) / 2);
  }

  if (ready) {
    const b = layout.button;
    ctx.strokeStyle = 'rgba(254, 202, 202, 0.75)';
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.fillStyle = 'rgba(127, 29, 29, 0.35)';
    ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.font = `${font}px ${family}`;
    ctx.fillStyle = '#fee2e2';
    ctx.textAlign = 'center';
    ctx.fillText(BACK_LABEL, b.x + b.w / 2, b.y + b.h / 2);
    ctx.textAlign = 'left';
  }
}
