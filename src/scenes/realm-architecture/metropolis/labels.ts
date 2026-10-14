import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter } from 'three';

/**
 * Os NOMES das obras: o nome em serifa itálica (Cormorant, a voz da
 * Yggdrasil), um filete e a legenda em mono espaçada (Geist Mono, a voz do
 * sistema). Desenhados UMA vez num atlas de 2 colunas de células 512×128
 * (1024 × 128·linhas), branco sobre transparente; o shader só lê o alpha.
 */
export const LABELS = {
  stonehenge: ['Stonehenge', 'Inglaterra · c. 3000 a.C.'],
  pyramid: ['Pirâmide de Gizé', 'Egito · c. 2560 a.C.'],
  parthenon: ['Partenon', 'Atenas · 438 a.C.'],
  colosseum: ['Coliseu', 'Roma · 80 d.C.'],
  pisa: ['Torre de Pisa', 'Pisa · 1372'],
  taj: ['Taj Mahal', 'Agra · 1653'],
  eiffel: ['Torre Eiffel', 'Paris · 1889'],
  bis: ['14-Bis', 'Santos Dumont · 1906'],
  goldengate: ['Golden Gate', 'São Francisco · 1937'],
  atomium: ['Atomium', 'Bruxelas · 1958'],
  congress: ['Congresso Nacional', 'Brasília · Niemeyer · 1960'],
  saturn: ['Saturn V', 'Cinco motores F-1 · 1967'],
  concorde: ['Concorde', 'Supersônico · 1969'],
  cathedral: ['Catedral de Brasília', 'Brasília · Niemeyer · 1970'],
  opera: ['Ópera de Sydney', 'Sydney · Jørn Utzon · 1973'],
  shinkansen: ['Shinkansen Série 500', 'Trem-bala · 1997'],
  louvre: ['Pirâmide do Louvre', 'Paris · I. M. Pei · 1989'],
  iss: ['Estação Espacial Internacional', 'Treliça integrada · 1998'],
  millau: ['Viaduto de Millau', 'França · 2004'],
  burj: ['Burj Khalifa', 'Dubai · 2010'],
} as const;

export type LabelId = keyof typeof LABELS;
export const LABEL_IDS = Object.keys(LABELS) as LabelId[];

const CELL = { w: 512, h: 128 } as const;
const WIDTH = 2 * CELL.w;
const HEIGHT = Math.ceil(LABEL_IDS.length / 2) * CELL.h;
/** Altura / largura de cada rótulo (a célula inteira). */
export const LABEL_ASPECT = CELL.h / CELL.w;

const fontVar = (name: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `${value}, ${fallback}` : fallback;
};

/** Garante as duas fontes antes de desenhar (o atlas é feito uma vez só). */
export async function loadLabelFonts() {
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load(`italic 300 50px ${fontVar('--font-cormorant', 'serif')}`),
    document.fonts.load(`400 15px ${fontVar('--font-geist-mono', 'monospace')}`),
  ]).catch(() => undefined);
}

export class LabelAtlas {
  readonly texture: CanvasTexture;
  /** uv (u0, v0, u1, v1) de cada rótulo. */
  readonly rects: Record<LabelId, [number, number, number, number]>;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d')!;
    const serif = fontVar('--font-cormorant', 'Georgia, serif');
    const mono = fontVar('--font-geist-mono', 'ui-monospace, monospace');
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const rects = {} as Record<LabelId, [number, number, number, number]>;
    LABEL_IDS.forEach((id, i) => {
      const [name, caption] = LABELS[id];
      const x0 = (i % 2) * CELL.w;
      const y0 = Math.floor(i / 2) * CELL.h;
      const cx = x0 + CELL.w / 2;
      ctx.globalAlpha = 1;
      ctx.font = `italic 300 50px ${serif}`;
      // Nomes longos encolhem para caber na célula (com respiro nas bordas).
      const width = ctx.measureText(name).width;
      if (width > CELL.w - 40) ctx.font = `italic 300 ${Math.floor((50 * (CELL.w - 40)) / width)}px ${serif}`;
      ctx.fillText(name, cx, y0 + 62);
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 22, y0 + 80);
      ctx.lineTo(cx + 22, y0 + 80);
      ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.font = `400 15px ${mono}`;
      if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '4px';
      ctx.fillText(caption.toUpperCase(), cx, y0 + 106);
      if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
      rects[id] = [x0 / WIDTH, 1 - (y0 + CELL.h) / HEIGHT, (x0 + CELL.w) / WIDTH, 1 - y0 / HEIGHT];
    });
    this.rects = rects;
    this.texture = new CanvasTexture(canvas);
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.anisotropy = 4;
  }
}
