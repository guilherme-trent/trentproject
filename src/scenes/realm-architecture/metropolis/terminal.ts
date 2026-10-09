import { ADMIN, BACK_LABEL, INTERCEPT } from './config';

/**
 * O terminal da interrupção é desenhado num Canvas2D e mostrado no WebGL
 * (não em HTML): no fim a TELA INTEIRA estilhaça, e só o que está no
 * framebuffer pode ser capturado. Um botão HTML invisível fica exatamente
 * sobre o botão desenhado — mesmo layout, uma fonte de verdade.
 *
 * Pixels CSS do viewport, origem no canto superior esquerdo. As falas
 * quebram em linhas visuais ("rows") pela largura medida da fonte mono.
 */
export interface TerminalRow {
  text: string;
  /** Fala (INTERCEPT) a que pertence. */
  line: number;
  /** Índice do primeiro caractere desta row na fala completa ("> " incluso). */
  start: number;
  top: number;
  bottom: number;
}

export interface TerminalLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  pad: number;
  font: number;
  charW: number;
  headerTop: number;
  rows: TerminalRow[];
  textBottom: number;
  button: { x: number; y: number; w: number; h: number };
}

let monoFamily = '';
export function mono() {
  if (!monoFamily) {
    const variable = getComputedStyle(document.documentElement).getPropertyValue('--font-geist-mono').trim();
    monoFamily = variable ? `${variable}, ui-monospace, Menlo, monospace` : 'ui-monospace, Menlo, monospace';
  }
  return monoFamily;
}

let measurer: CanvasRenderingContext2D | null = null;
function charWidth(font: number) {
  measurer ??= document.createElement('canvas').getContext('2d');
  if (!measurer) return font * 0.6;
  measurer.font = `${font}px ${mono()}`;
  return measurer.measureText('M').width;
}

/** Quebra por palavras em no máximo `max` caracteres, guardando onde cada row começa. */
function wrapChars(text: string, max: number) {
  const rows: { text: string; start: number }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + max);
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end);
      if (space > start) end = space;
    }
    rows.push({ text: text.slice(start, end), start });
    start = end;
    while (text[start] === ' ') start++;
  }
  return rows;
}

const cache = { key: '', layout: null as TerminalLayout | null };

export function terminalLayout(viewW: number, viewH: number): TerminalLayout {
  const key = `${viewW}x${viewH}`;
  if (cache.key === key && cache.layout) return cache.layout;
  const compact = viewW < 560 || viewH < 520;
  const font = compact ? 13 : 16;
  const lineH = Math.round(font * 1.7);
  const pad = compact ? 18 : 28;
  const w = Math.min(700, viewW - 24);
  const charW = charWidth(font);
  const maxChars = Math.max(12, Math.floor((w - pad * 2) / charW));
  const headerTop = pad;
  const header = Math.round(font * 3.6);
  let top = pad + header;
  const rows: TerminalRow[] = [];
  INTERCEPT.forEach((line, i) => {
    for (const row of wrapChars(`> ${line.text}`, maxChars)) {
      rows.push({ text: row.text, line: i, start: row.start, top, bottom: top + lineH });
      top += lineH;
    }
  });
  const textBottom = top;
  const button = { w: Math.min(w - pad * 2, Math.round(font * 17)), h: Math.round(font * 3.1), x: 0, y: 0 };
  const h = textBottom + Math.round(font * 1.6) + button.h + pad;
  button.x = Math.round((w - button.w) / 2);
  button.y = h - pad - button.h;
  const layout = { x: Math.round((viewW - w) / 2), y: Math.round(Math.max(12, (viewH - h) / 2)), w, h, pad, font, charW, headerTop, rows, textBottom, button };
  cache.key = key;
  cache.layout = layout;
  return layout;
}

/**
 * Desenha o painel com as falas `0..lines−1` (a digitação e o pisca da
 * última são do shader — sem novo upload) e o botão quando `ready`.
 * Terminal de sistema invadido: preto, vermelho de alarme, moldura dura.
 */
export function drawTerminal(ctx: CanvasRenderingContext2D, layout: TerminalLayout, scale: number, lines: number, ready: boolean) {
  const { w, h, pad, font } = layout;
  const family = mono();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6, 3, 4, 0.95)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

  ctx.strokeStyle = 'rgba(248, 113, 113, 0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.fillStyle = 'rgba(248, 113, 113, 0.95)';
  for (const [cx, cy] of [[0, 0], [w - 12, 0], [0, h - 3], [w - 12, h - 3]]) ctx.fillRect(cx, cy, 12, 3);

  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(font * 0.66)}px ${family}`;
  ctx.fillStyle = 'rgba(248, 113, 113, 0.85)';
  ctx.fillText('▲ ALERTA · FALHA DE CONTENÇÃO · CANAL PRIORITÁRIO', pad, layout.headerTop + font * 0.5);
  ctx.font = `600 ${Math.round(font * 0.92)}px ${family}`;
  ctx.fillStyle = '#fecaca';
  ctx.fillText(ADMIN, pad, layout.headerTop + font * 1.9);

  ctx.font = `${font}px ${family}`;
  for (const row of layout.rows) {
    if (row.line >= lines) break;
    ctx.fillStyle = row.line === lines - 1 ? '#fafaf9' : 'rgba(231, 229, 228, 0.6)';
    ctx.fillText(row.text, pad, (row.top + row.bottom) / 2);
  }

  if (ready) {
    const b = layout.button;
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#fca5a5';
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.font = `600 ${font}px ${family}`;
    ctx.fillStyle = '#fff1f2';
    ctx.textAlign = 'center';
    ctx.fillText(BACK_LABEL, b.x + b.w / 2, b.y + b.h / 2);
    ctx.textAlign = 'left';
  }
}

/** Onde está a digitação: row atual (px do painel) e o x revelado. */
export function typingState(layout: TerminalLayout, line: number, chars: number) {
  const rows = layout.rows.filter((row) => row.line === line);
  if (!rows.length) return null;
  let row = rows[0];
  for (const candidate of rows) if (chars >= candidate.start) row = candidate;
  const done = chars >= `> ${INTERCEPT[line].text}`.length;
  return {
    lineTop: rows[0].top,
    rowTop: row.top,
    rowBottom: row.bottom,
    reveal: done ? 1e5 : layout.pad + Math.max(0, chars - row.start) * layout.charW,
    done,
  };
}
