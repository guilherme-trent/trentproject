import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter } from 'three';
import { PHRASES } from './config';

/**
 * O atlas do manifesto: os 4 trechos desenhados UMA vez num Canvas2D
 * (2048², uma faixa de 512px por trecho), branco sobre transparente. O
 * shader só lê o alpha. Em retrato as linhas quebram mais cedo (o trecho
 * fica mais alto e estreito, cabendo na largura da tela).
 */
const SIZE = 2048;
const CELL = SIZE / PHRASES.length;
const FONT = 76;
const LINE = Math.round(FONT * 1.28);

export interface PhraseBlock {
  /** uv (u0, v0, u1, v1) no atlas. */
  rect: [number, number, number, number];
  /** altura / largura do bloco de texto. */
  aspect: number;
}

let sansFamily = '';
function sans() {
  if (!sansFamily) {
    const variable = getComputedStyle(document.documentElement).getPropertyValue('--font-geist-sans').trim();
    sansFamily = variable ? `${variable}, system-ui, sans-serif` : 'system-ui, sans-serif';
  }
  return sansFamily;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export class PhraseAtlas {
  readonly canvas = document.createElement('canvas');
  readonly texture: CanvasTexture;
  blocks: PhraseBlock[] = [];
  portrait: boolean | null = null;

  constructor() {
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.anisotropy = 4;
  }

  /** (Re)desenha para a orientação dada; no-op se nada mudou. */
  layout(portrait: boolean) {
    if (portrait === this.portrait) return;
    this.portrait = portrait;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.font = `300 ${FONT}px ${sans()}`;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    const max = portrait ? 1080 : 1880;
    this.blocks = PHRASES.map((phrase, i) => {
      const lines = wrap(ctx, phrase.text, max).slice(0, 4);
      const width = Math.ceil(Math.max(...lines.map((line) => ctx.measureText(line).width)));
      const height = lines.length * LINE;
      const top = i * CELL + Math.round((CELL - height) / 2);
      // Centralizado: cada linha alinhada ao meio do bloco.
      lines.forEach((line, k) => ctx.fillText(line, 16 + (width - ctx.measureText(line).width) / 2, top + k * LINE));
      const pad = 12;
      const x0 = 16 - pad;
      const x1 = 16 + width + pad;
      const y0 = top - pad;
      const y1 = top + height + pad;
      return { rect: [x0 / SIZE, 1 - y1 / SIZE, x1 / SIZE, 1 - y0 / SIZE], aspect: (y1 - y0) / (x1 - x0) };
    });
    this.texture.needsUpdate = true;
  }
}
