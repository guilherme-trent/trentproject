/*
 * A cidade neon. Sete camadas de prédios em profundidade, mais a torre dos anéis, o trem, o tráfego
 * aéreo, a chuva, os holofotes e as nuvens. A câmera começa nas nuvens e, conforme a página rola,
 * desce até perto da rua: cada camada sobe numa velocidade proporcional à sua proximidade
 * (a mesma conta de uma câmera de verdade), e o ponteiro desloca as camadas do mesmo jeito.
 *
 * Tudo é 2D (canvas), sem WebGL. Desempenho:
 *  - o que é parado (prédios, janelas, céu, placas) é desenhado UMA vez em telas fora da página e só
 *    carimbado a cada quadro, em colunas justas ao contorno dos prédios;
 *  - descarte de oclusão: antes de desenhar, calcula da frente para trás o que cada camada esconde,
 *    e as de trás só são pintadas até ali (o céu também);
 *  - rede de segurança: se a máquina não segurar 48 QPS, tira primeiro o que menos se nota e,
 *    se ainda precisar, desenha com menos pixels.
 */

export interface ElementosDaCidade {
  /** O trecho alto da página que dá curso à descida. */
  topo: HTMLElement;
  /** O palco preso na tela (sticky) onde a cidade é desenhada. */
  palco: HTMLElement;
  tela: HTMLCanvasElement;
  /** O bloco de texto por cima da cidade (sobe e some no fim da descida). */
  texto?: HTMLElement | null;
  role?: HTMLElement | null;
  altitude?: HTMLElement | null;
  qps?: HTMLElement | null;
  trafego?: HTMLElement | null;
}

type Cor = string; // "r,g,b", para montar rgba() com qualquer opacidade
type Rgb = number[];
interface Placa { aceso: HTMLCanvasElement; apagado: HTMLCanvasElement; w: number; h: number }
interface Letreiro { placa: Placa; cor: Cor; x: number; y: number; proximo: number; falha: number }
interface JanelaViva { x: number; y: number; w: number; h: number; cor: Cor; ate: number; acesa: boolean }
interface Luz { x: number; y: number; fase: number; r: number }
interface Fita { x: number; y0: number; y1: number; x1: number; cor: Cor; fase: number; vel: number }
interface Coluna { x: number; y: number; w: number; h: number; opaco: number[]; ate: number }
interface Camada {
  z: number; s: number; c: HTMLCanvasElement; x0: number; alto: number; corPredio: Rgb;
  janelasVivas: JanelaViva[]; luzes: Luz[]; letreiros: Letreiro[]; fitas: Fita[]; colunas: Coluna[];
  proximoChao?: () => number;
}
interface Faixa { c: HTMLCanvasElement; largura: number; altura: number }
interface Carro { z: number; alt: number; x: number; vel: number; fase: number }
interface Chuva { n: number; comp: number; vel: number; a: number; w: number; gotas: number[][] }

// Paleta: o verde da nebulosa, o vermelho de alerta do site e dois acentos (âmbar e ciano)
const VERDE = '110,231,183', MENTA = '167,243,208', VERMELHO = '248,113,113', AMBAR = '251,191,36', CIANO = '103,232,249';
const JANELA = '200,245,225', LAMPADA = '255,200,120';

function semente(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const suave = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mistura = (a: Rgb, b: Rgb, t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// Perspectiva: quanto mais perto (z → 1), maior e mais rápido na rolagem e no ponteiro
const escala = (z: number) => 0.07 + 0.93 * Math.pow(z, 1.6);
const PROFUNDIDADES = [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1];
const ZTORRE = 0.43, ZTREM = 0.69;

/* Os letreiros, cada um onde faria sentido: comércio na altura da rua (placa horizontal sobre a vitrine),
   hotel e clube na fachada de prédios médios (placa vertical), rádio só onde há antena.
   Arranha-céu não tem letreiro. */
const COMERCIO = ['PIZZA', 'BAR', 'CAFÉ', 'ARCADE', 'CINE', 'LOJA', '24H', 'RAMEN', 'TATTOO', 'GAMES'];
const FACHADA = ['HOTEL', 'HOTEL', 'CLUBE', 'MOTEL'];

// cada anel da torre: altura na torre (fração), raio, cor, velocidade e quantos nós de luz correm nele
const ANEIS = [
  { em: 0.5, raio: 5.2, cor: VERDE, vel: 0.55, nos: 7 },
  { em: 0.67, raio: 3.9, cor: CIANO, vel: -0.8, nos: 5 },
  { em: 0.82, raio: 2.7, cor: VERDE, vel: 1.15, nos: 4 },
];
const HOLOFOTES = [{ x: 0.34, fase: 0, vel: 0.35, cor: MENTA }, { x: 0.57, fase: 2, vel: 0.27, cor: VERDE }, { x: 0.93, fase: 4, vel: 0.31, cor: CIANO }];
const HOLOGRAMA = { z: 0.65, x: 0.885, alt: 0.95 };

/** Liga a cidade nos elementos dados. Devolve a função que desliga tudo (para o desmontar do React). */
export function iniciarCidade(el: ElementosDaCidade): () => void {
  const { topo, palco, tela } = el;
  const ctx = tela.getContext('2d');
  if (!ctx) return () => {};
  const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RITMO = calmo ? 0.6 : 1; // reduzir, não eliminar
  const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-geist-mono').trim() || 'monospace';

  let W = 0, H = 0, dpr = 1, retrato = false;
  let horizonte = 0, rolagem = 0, mx = 0, my = 0, alvoMx = 0, alvoMy = 0;
  let leve = false, minimo = false;

  const alturaCamera = () => H * (1.25 - 0.62 * rolagem);
  const chao = (s: number) => horizonte + alturaCamera() * s + my * 14 * s;
  const desvioX = (s: number) => -mx * 46 * s;

  function telaFora(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * dpr));
    c.height = Math.max(1, Math.ceil(h * dpr));
    const x = c.getContext('2d')!;
    x.scale(dpr, dpr);
    return [c, x];
  }

  // Um brilho redondo, desenhado uma vez e carimbado (sem shadowBlur por quadro)
  const brilhos = new Map<Cor, HTMLCanvasElement>();
  function brilho(cor: Cor) {
    let c = brilhos.get(cor);
    if (c) return c;
    const [nova, x] = telaFora(64, 64);
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${cor},1)`);
    g.addColorStop(0.18, `rgba(${cor},0.55)`);
    g.addColorStop(1, `rgba(${cor},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    brilhos.set(cor, (c = nova));
    return c;
  }
  function carimbar(cor: Cor, x: number, y: number, r: number, a = 1) {
    if (a <= 0.01 || r < 0.5) return;
    ctx!.globalAlpha = Math.min(1, a);
    ctx!.drawImage(brilho(cor), x - r, y - r, r * 2, r * 2);
    ctx!.globalAlpha = 1;
  }

  /* ── O céu: degradê, estrelas, a lua e o brilho da cidade no horizonte ── */
  let ceu: HTMLCanvasElement | null = null;
  function montarCeu() {
    const [c, x] = telaFora(W, H * 1.2);
    const g = x.createLinearGradient(0, 0, 0, H * 1.2);
    g.addColorStop(0, '#010302');
    g.addColorStop(0.3, '#03100c');
    g.addColorStop(0.47, '#0a2e23');
    g.addColorStop(0.56, '#0f3d2e');
    g.addColorStop(1, '#06160f');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H * 1.2);
    const r = semente(7);
    for (let i = 0; i < 260; i++) {
      const px = r() * W, py = r() * H * 0.45, b = r();
      x.fillStyle = `rgba(${MENTA},${0.15 + b * 0.6 * (1 - py / (H * 0.5))})`;
      x.fillRect(px, py, b > 0.92 ? 1.6 : 1, b > 0.92 ? 1.6 : 1);
    }
    // a lua, meio coberta pela neblina
    const lx = W * (retrato ? 0.3 : 0.6), ly = H * (retrato ? 0.1 : 0.12), lr = Math.min(W, H) * 0.035;
    const halo = x.createRadialGradient(lx, ly, lr * 0.8, lx, ly, lr * 6);
    halo.addColorStop(0, 'rgba(200,255,230,0.16)');
    halo.addColorStop(1, 'rgba(200,255,230,0)');
    x.fillStyle = halo;
    x.fillRect(lx - lr * 6, ly - lr * 6, lr * 12, lr * 12);
    x.fillStyle = '#d9f5e8';
    x.beginPath(); x.arc(lx, ly, lr, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(3,16,12,0.35)';
    x.beginPath(); x.arc(lx + lr * 0.35, ly - lr * 0.1, lr * 0.95, 0, Math.PI * 2); x.fill();
    ceu = c;
  }

  /* ── Nuvens: faixas de bolhas macias, iluminadas por baixo pelo verde da cidade ── */
  function montarNuvens(seed: number, largura: number, altura: number, densidade: number, claro: number): Faixa {
    const [c, x] = telaFora(largura, altura);
    const r = semente(seed);
    for (let i = 0; i < densidade; i++) {
      const px = r() * largura, py = altura * (0.25 + r() * 0.5), raio = altura * (0.15 + r() * 0.35);
      const g = x.createRadialGradient(px, py, 0, px, py, raio);
      g.addColorStop(0, py > altura * 0.5 ? `rgba(30,90,70,${claro})` : `rgba(14,38,31,${claro})`);
      g.addColorStop(1, 'rgba(14,38,31,0)');
      x.fillStyle = g;
      x.fillRect(px - raio, py - raio, raio * 2, raio * 2);
      // repete nas bordas, para a faixa emendar sem costura ao correr para o lado
      if (px < raio) { x.save(); x.translate(largura, 0); x.fillRect(px - raio, py - raio, raio * 2, raio * 2); x.restore(); }
      if (px > largura - raio) { x.save(); x.translate(-largura, 0); x.fillRect(px - raio, py - raio, raio * 2, raio * 2); x.restore(); }
    }
    return { c, largura, altura };
  }
  let nuvensFundo: Faixa, nuvensFrente: Faixa, neblina: Faixa;

  /* ── Os letreiros, em duas versões (aceso e apagado) ── */
  function montarLetreiro(palavra: string, cor: Cor, tam: number, horizontal = false): Placa {
    const letra = tam, pad = tam * 0.45;
    const w = horizontal ? palavra.length * letra * 0.78 + pad * 2 : letra + pad * 2;
    const h = horizontal ? letra + pad * 2 : palavra.length * letra * 1.05 + pad * 2;
    const posicao = (i: number): [number, number] => (horizontal ? [pad + (i + 0.5) * letra * 0.78, pad] : [w / 2, pad + i * letra * 1.05]);
    const [aceso, apagado] = [true, false].map((ligado) => {
      const [c, x] = telaFora(w + 16, h + 16);
      x.translate(8, 8);
      x.fillStyle = 'rgba(2,6,5,0.92)';
      x.fillRect(0, 0, w, h);
      x.strokeStyle = `rgba(${cor},${ligado ? 0.95 : 0.25})`;
      x.lineWidth = Math.max(1, tam * 0.08);
      if (ligado) { x.shadowColor = `rgba(${cor},0.9)`; x.shadowBlur = tam * 0.6; }
      x.strokeRect(0.5, 0.5, w - 1, h - 1);
      x.fillStyle = ligado ? `rgba(${cor},1)` : `rgba(${cor},0.22)`;
      x.font = `700 ${letra}px ${mono}`;
      x.textAlign = 'center';
      x.textBaseline = 'top';
      [...palavra].forEach((l, i) => x.fillText(l, ...posicao(i)));
      if (ligado) {
        x.shadowBlur = 0;
        x.fillStyle = 'rgba(255,255,255,0.55)';
        [...palavra].forEach((l, i) => x.fillText(l, ...posicao(i)));
      }
      return c;
    });
    return { aceso, apagado, w: w + 16, h: h + 16 };
  }

  /* ── As camadas de prédios ── */
  let camadas: Camada[] = [];
  function montarCamada(z: number, indice: number): Camada {
    const s = escala(z);
    const r = semente(100 + indice * 17);
    const pad = 60 * s + 30;
    const x0 = -pad, largura = W + pad * 2;
    const perto = z >= 0.99;
    const corPredio = mistura([9, 30, 24], [2, 7, 6], Math.pow(z, 0.6));
    const predios: { x: number; w: number; h: number }[] = [];
    let x = x0 + r() * 20;
    while (x < W + pad) {
      const w = (60 + r() * 200) * Math.pow(s, 0.8) * (retrato ? 0.8 : 1);
      const meio = (x + w / 2) / W;
      // a camada mais próxima só emoldura as bordas; no meio fica o caminho do olhar
      const pula = perto ? meio > 0.1 && meio < 0.86 : z >= 0.8 ? meio > 0.15 && meio < 0.55 && r() < 0.6 : false;
      if (!pula) {
        const sobe = retrato ? 0.9 : 0.42 + 0.75 * suave(0.12, 0.72, meio); // à esquerda, mais baixo: o texto respira
        const torre = r() < 0.09 ? 1.6 : 1;
        predios.push({ x, w, h: Math.max(14 * s, H * (0.28 + r() * 0.85) * sobe * torre * s) });
      }
      x += w + (r() < 0.3 ? r() * w * 0.35 : 0);
    }
    const alto = Math.max(...predios.map((p) => p.h)) + 80 * s + 10;
    const [c, g] = telaFora(largura, alto);
    const janelasVivas: JanelaViva[] = [], luzes: Luz[] = [], letreiros: Letreiro[] = [], fitas: Fita[] = [];
    const cores = [VERDE, VERMELHO, AMBAR, CIANO, VERDE];

    for (const p of predios) {
      const lx = p.x - x0, topoY = alto - p.h;
      // corpo com o topo um pouco mais claro (o céu da cidade bate em cima)
      const grad = g.createLinearGradient(0, topoY, 0, alto);
      grad.addColorStop(0, `rgb(${mistura(corPredio, [20, 60, 48], 0.35 * (1 - z))})`);
      grad.addColorStop(0.25, `rgb(${corPredio})`);
      grad.addColorStop(1, `rgb(${corPredio})`);
      g.fillStyle = grad;
      // alguns têm o topo recortado (degrau ou chanfro)
      const forma = r();
      g.beginPath();
      if (forma < 0.18 && p.w > 30 * s) {
        const d = p.w * 0.3;
        g.moveTo(lx, alto); g.lineTo(lx, topoY + d * 0.6); g.lineTo(lx + d, topoY); g.lineTo(lx + p.w, topoY); g.lineTo(lx + p.w, alto);
      } else if (forma < 0.34) {
        const d = p.w * (0.2 + r() * 0.2);
        g.moveTo(lx, alto); g.lineTo(lx, topoY + d); g.lineTo(lx + d, topoY + d); g.lineTo(lx + d, topoY);
        g.lineTo(lx + p.w - d, topoY); g.lineTo(lx + p.w - d, topoY + d); g.lineTo(lx + p.w, topoY + d); g.lineTo(lx + p.w, alto);
      } else {
        g.rect(lx, topoY, p.w, p.h);
      }
      g.fill();
      // a quina iluminada pelo neon
      g.fillStyle = `rgba(${VERDE},${0.05 + 0.12 * z})`;
      g.fillRect(lx + p.w - Math.max(1, s * 2), topoY, Math.max(1, s * 2), p.h);

      // janelas (de longe, viram pontinhos)
      if (s >= 0.2) {
        const jw = 5 * s + 1, jh = 8 * s + 1, gx = 12 * s + 2.5, gy = 17 * s + 3;
        const acesas = 0.12 + r() * 0.35;
        const vidro = r() < 0.18; // prédio de vidro: faixas horizontais em vez de janelas
        const tom = r();
        for (let jy = topoY + 14 * s + 4; jy < alto - jh; jy += gy) {
          if (vidro) {
            g.fillStyle = `rgba(${tom < 0.5 ? MENTA : CIANO},${0.04 + r() * 0.1})`;
            g.fillRect(lx + 3 * s, jy, p.w - 6 * s, jh * 0.6);
            continue;
          }
          for (let jx = lx + 6 * s + 2; jx < lx + p.w - jw - 4 * s; jx += gx) {
            const sorte = r();
            if (sorte < acesas) {
              const cor = sorte < acesas * 0.7 ? JANELA : sorte < acesas * 0.9 ? LAMPADA : CIANO;
              g.fillStyle = `rgba(${cor},${(0.3 + r() * 0.55) * (0.6 + 0.4 * z)})`;
              g.fillRect(jx, jy, jw, jh);
            } else {
              g.fillStyle = 'rgba(255,255,255,0.025)';
              g.fillRect(jx, jy, jw, jh);
              if (r() < 0.02 && janelasVivas.length < 60) janelasVivas.push({ x: jx, y: jy, w: jw, h: jh, cor: r() < 0.7 ? JANELA : LAMPADA, ate: 0, acesa: false });
            }
          }
        }
      } else {
        const n = Math.floor(p.w * p.h * 0.02);
        for (let i = 0; i < n; i++) {
          g.fillStyle = `rgba(${r() < 0.8 ? JANELA : LAMPADA},${0.2 + r() * 0.5})`;
          g.fillRect(lx + 1 + r() * (p.w - 2), topoY + 2 + r() * (p.h - 2), 1, 1);
        }
      }

      // antenas no topo dos mais altos, com a luz vermelha de aviação
      let temAntena = false;
      if (p.h > H * 0.45 * s && r() < 0.6) {
        temAntena = true;
        const ah = (20 + r() * 50) * s + 4, ax = lx + p.w * (0.3 + r() * 0.4);
        g.strokeStyle = `rgb(${mistura(corPredio, [40, 80, 70], 0.3)})`;
        g.lineWidth = Math.max(1, 2 * s);
        g.beginPath(); g.moveTo(ax, topoY); g.lineTo(ax, topoY - ah); g.stroke();
        luzes.push({ x: ax, y: topoY - ah, fase: r() * 6.28, r: 4 + 9 * s });
      }
      // fitas de LED nas quinas, com um pulso de luz que corre por elas
      if (z >= 0.35 && r() < 0.2) {
        const cor = [VERDE, CIANO, VERMELHO][Math.floor(r() * 3)];
        g.save();
        g.strokeStyle = `rgba(${cor},0.85)`;
        g.shadowColor = `rgba(${cor},0.9)`;
        g.shadowBlur = 10 * s;
        g.lineWidth = Math.max(1, 2.2 * s);
        g.beginPath(); g.moveTo(lx + 1, alto); g.lineTo(lx + 1, topoY + 1); g.lineTo(lx + p.w - 1, topoY + 1); g.stroke();
        g.restore();
        fitas.push({ x: lx + 1, y0: alto, y1: topoY + 1, x1: lx + p.w - 1, cor, fase: r() * 10, vel: 0.12 + r() * 0.2 });
      }
      // o térreo: vitrine acesa e, em boa parte, a placa do comércio logo acima
      if (z >= 0.5 && p.w > 50 * s) {
        const vitrine = 14 * s + 2;
        if (r() < 0.75) {
          g.fillStyle = `rgba(255,214,150,${0.18 + r() * 0.2})`;
          g.fillRect(lx + 5 * s, alto - vitrine - 4 * s, p.w - 10 * s, vitrine);
          g.fillStyle = `rgba(${VERDE},0.1)`;
          g.fillRect(lx + 5 * s, alto - 4 * s, p.w - 10 * s, 4 * s);
        }
        if (r() < 0.6) {
          const cor = cores[Math.floor(r() * cores.length)];
          const placa = montarLetreiro(COMERCIO[Math.floor(r() * COMERCIO.length)], cor, Math.max(6, 11 * s), true);
          if (placa.w < p.w + 8) letreiros.push({ placa, cor, x: lx + (p.w - placa.w) / 2 + 8, y: alto - vitrine - 6 * s - placa.h + 12, proximo: r() * 6, falha: 0 });
        }
      }
      // prédio médio: o letreiro vertical na quina (hotel, clube; rádio só se tiver antena)
      if (z >= 0.5 && p.h <= H * 0.8 * s && p.h > 200 * s && r() < 0.3) {
        const palavra = temAntena && r() < 0.6 ? 'RÁDIO' : FACHADA[Math.floor(r() * FACHADA.length)];
        const cor = cores[Math.floor(r() * cores.length)];
        const placa = montarLetreiro(palavra, cor, Math.max(7, 17 * s));
        const lado = r() < 0.5;
        letreiros.push({ placa, cor, x: lado ? lx - placa.w * 0.35 : lx + p.w - placa.w * 0.65, y: topoY + 22 * s, proximo: r() * 6, falha: 0 });
      }
    }
    // a rua na base: o brilho que sobe dela e a fila de postes
    if (z >= 0.2) {
      const brilhoRua = g.createLinearGradient(0, alto - 60 * s, 0, alto);
      brilhoRua.addColorStop(0, `rgba(${VERDE},0)`);
      brilhoRua.addColorStop(1, `rgba(${VERDE},${0.06 + 0.1 * z})`);
      g.fillStyle = brilhoRua;
      g.fillRect(0, alto - 60 * s, largura, 60 * s);
      for (let px = r() * 50 * s; px < largura; px += 46 * s + 6) {
        g.fillStyle = `rgba(255,214,150,${0.5 + 0.4 * z})`;
        g.fillRect(px, alto - 4 * s - 2, Math.max(1, 2.4 * s), Math.max(1, 2.4 * s));
      }
    }

    // Corta a camada em colunas justas ao contorno dos prédios: o céu transparente entre eles não é
    // carimbado a cada quadro. Em cada fatia de 32 px, guarda a partir de onde ela é opaca (o topo mais
    // baixo entre as lâminas de 4 px), que alimenta o descarte de oclusão.
    const COL = 96;
    const colunas: Coluna[] = [];
    for (let cx = 0; cx < largura; cx += COL) {
      let alturaTopo = alto - 70 * s - 6; // a faixa da rua sempre entra
      for (const p of predios) {
        const lx = p.x - x0;
        if (lx < cx + COL && lx + p.w > cx) alturaTopo = Math.min(alturaTopo, alto - p.h - 80 * s - 12);
      }
      alturaTopo = Math.max(0, Math.floor(alturaTopo));
      const opaco: number[] = [];
      for (let sx = cx; sx < Math.min(cx + COL, largura); sx += 32) {
        let o = 0;
        for (let fx = sx; fx < Math.min(sx + 32, largura); fx += 4) {
          let t = alto;
          for (const p of predios) {
            const lx = p.x - x0;
            if (lx <= fx && lx + p.w >= fx + 4) t = Math.min(t, alto - p.h * 0.66); // 0,66: margem para os topos recortados
          }
          o = Math.max(o, t);
        }
        opaco.push(o);
      }
      colunas.push({ x: cx, y: alturaTopo, w: Math.min(COL, largura - cx), h: alto - alturaTopo, opaco, ate: alto });
    }
    return { z, s, c, x0, alto, corPredio, janelasVivas, luzes, letreiros, fitas, colunas };
  }

  /* ── A torre dos anéis: o marco da cidade, com três anéis holográficos girando em volta ── */
  let torre: { c: HTMLCanvasElement; s: number; largura: number; alto: number; h: number; xRel: number };
  const corTorre = mistura([9, 30, 24], [2, 7, 6], Math.pow(ZTORRE, 0.6));
  function montarTorre() {
    const s = escala(ZTORRE);
    const h = H * 2.15 * s, w = 88 * s;
    const largura = w * 3, alto = h + 90 * s;
    const [c, g] = telaFora(largura, alto);
    const cx = largura / 2;
    g.fillStyle = `rgb(${corTorre})`;
    // três estágios que afinam até a agulha
    const estagios = [[1, 0, 0.45], [0.72, 0.45, 0.78], [0.46, 0.78, 1]];
    for (const [f, a, b] of estagios) g.fillRect(cx - (w * f) / 2, alto - h * b, w * f, h * (b - a) + 1);
    g.strokeStyle = `rgb(${corTorre})`;
    g.lineWidth = Math.max(1.5, 3 * s);
    g.beginPath(); g.moveTo(cx, alto - h); g.lineTo(cx, alto - h - 85 * s); g.stroke();
    // a coluna de luz no centro da fachada e os anéis de luz entre os estágios
    g.save();
    g.shadowColor = `rgba(${VERDE},1)`;
    g.shadowBlur = 12 * s;
    g.fillStyle = `rgba(${MENTA},0.9)`;
    g.fillRect(cx - Math.max(1, 2 * s), alto - h * 0.98, Math.max(2, 4 * s), h * 0.98);
    for (const [f, a] of estagios) {
      g.fillStyle = `rgba(${VERDE},0.85)`;
      g.fillRect(cx - (w * f) / 2, alto - h * a - Math.max(1, 2 * s), w * f, Math.max(1.5, 3 * s));
    }
    g.restore();
    const r = semente(42);
    for (let y = alto - h * 0.97; y < alto - 6; y += 9 * s + 2) {
      const f = y < alto - h * 0.78 ? 0.46 : y < alto - h * 0.45 ? 0.72 : 1;
      for (let x = cx - (w * f) / 2 + 4 * s; x < cx + (w * f) / 2 - 6 * s; x += 7 * s + 2) {
        if (Math.abs(x - cx) < 4 * s) continue;
        if (r() < 0.35) { g.fillStyle = `rgba(${JANELA},${0.25 + r() * 0.5})`; g.fillRect(x, y, 3 * s + 1, 5 * s + 1); }
      }
    }
    torre = { c, s, largura, alto, h, xRel: retrato ? 0.62 : 0.71 };
  }

  function desenharAneis(t: number, frente: boolean, cx: number, chaoTorre: number) {
    const s = torre.s;
    for (const a of ANEIS) {
      const altura = torre.h * a.em;
      const cy = chaoTorre - altura + Math.sin(t * 0.8 + a.em * 9) * 4 * s;
      const rx = 70 * s * a.raio * (retrato ? 0.75 : 1);
      // a inclinação depende de onde a câmera está: de cima, vemos o anel por cima; abaixo dele, por baixo
      const camAcima = (alturaCamera() * s - altura) / (H * 0.9 * s);
      const incl = Math.max(-0.3, Math.min(0.3, camAcima * 0.55)) + Math.sin(t * 0.5 + a.em * 5) * 0.02;
      const ry = rx * Math.abs(incl) + 1;
      const frenteEmBaixo = incl > 0; // vendo de cima, a metade de baixo é a da frente
      const [ini, fim] = frente === frenteEmBaixo ? [0, Math.PI] : [Math.PI, Math.PI * 2];
      const giro = t * a.vel * RITMO;
      ctx!.save();
      ctx!.globalCompositeOperation = 'lighter';
      ctx!.lineWidth = Math.max(1, 5 * s);
      ctx!.strokeStyle = `rgba(${a.cor},${frente ? 0.14 : 0.07})`;
      ctx!.beginPath(); ctx!.ellipse(cx, cy, rx, ry, 0, ini, fim); ctx!.stroke();
      ctx!.lineWidth = Math.max(1, 1.6 * s);
      ctx!.strokeStyle = `rgba(${a.cor},${frente ? 0.85 : 0.35})`;
      ctx!.setLineDash([22 * s, 9 * s, 3 * s, 9 * s]);
      ctx!.lineDashOffset = (frenteEmBaixo ? -1 : 1) * giro * 60 * s;
      ctx!.beginPath(); ctx!.ellipse(cx, cy, rx, ry, 0, ini, fim); ctx!.stroke();
      ctx!.setLineDash([]);
      ctx!.restore();
      // os nós de luz que correm no anel (o que deixa o giro óbvio)
      for (let k = 0; k < a.nos; k++) {
        const th = giro + (k / a.nos) * Math.PI * 2;
        const sn = Math.sin(th);
        if (sn > 0 !== (frente === frenteEmBaixo)) continue;
        const px = cx + Math.cos(th) * rx, py = cy + sn * ry;
        const prof = frente ? 1 : 0.45;
        carimbar(a.cor, px, py, 9 * s + 3, 0.9 * prof);
        ctx!.fillStyle = `rgba(255,255,255,${0.9 * prof})`;
        ctx!.fillRect(px - 1, py - 1, 2, 2);
      }
    }
  }

  function desenharTorre(t: number) {
    const s = torre.s;
    const base = chao(s);
    const cx = torre.xRel * W + desvioX(s);
    desenharAneis(t, false, cx, base);
    ctx!.drawImage(torre.c, cx - torre.largura / 2, base - torre.alto, torre.largura, torre.alto);
    if (base < H) { ctx!.fillStyle = `rgb(${corTorre})`; ctx!.fillRect(cx - torre.largura / 2, base - 1, torre.largura, H - base + 1); }
    // o farol no topo da agulha
    carimbar(VERDE, cx, base - torre.h - 85 * s, 14 * s + 6, 0.5 + 0.25 * (Math.sin(t * 1.6 * RITMO) + 1));
    desenharAneis(t, true, cx, base);
  }

  /* ── Tráfego aéreo: ao fundo, pequenos e lentos; na frente, grandes e rápidos ── */
  let carros: Carro[] = [];
  function montarTrafego() {
    const r = semente(9);
    const faixas = [
      { z: 0.12, alt: 0.55 }, { z: 0.27, alt: 0.7 }, { z: 0.42, alt: 0.35 }, { z: 0.58, alt: 0.95 },
      { z: 0.6, alt: 0.5 }, { z: 0.74, alt: 0.75 }, { z: 0.9, alt: 1.05 },
    ];
    carros = [];
    faixas.forEach((f, i) => {
      const n = 3 + Math.floor(r() * 4);
      const sentido = i % 2 ? 1 : -1;
      for (let k = 0; k < n; k++) {
        carros.push({ z: f.z + k * 0.001, alt: f.alt + (r() - 0.5) * 0.08, x: r() * (W + 400) - 200, vel: (90 + r() * 160) * sentido, fase: r() * 6.28 });
      }
    });
  }
  function desenharCarro(c: Carro, dt: number, t: number) {
    const s = escala(c.z);
    c.x += c.vel * s * 2.2 * dt * RITMO;
    if (c.x > W + 220) c.x = -220;
    if (c.x < -220) c.x = W + 220;
    const x = c.x + desvioX(s);
    const y = chao(s) - c.alt * H * s - 160 * s + Math.sin(t * 1.3 + c.fase) * 3 * s;
    if (y < -40 || y > H + 40) return;
    const comp = 26 * s + 4, alt = 6 * s + 1.5, dir = Math.sign(c.vel);
    // o rastro de luz dos que passam perto
    if (s > 0.45) {
      const g = ctx!.createLinearGradient(x, y, x - dir * comp * 5, y);
      g.addColorStop(0, `rgba(${VERMELHO},0.35)`);
      g.addColorStop(1, `rgba(${VERMELHO},0)`);
      ctx!.fillStyle = g;
      ctx!.fillRect(Math.min(x, x - dir * comp * 5), y - alt * 0.2, comp * 5, alt * 0.4);
    }
    ctx!.fillStyle = '#071410';
    ctx!.beginPath();
    ctx!.roundRect(x - comp / 2, y - alt / 2, comp, alt, alt / 2);
    ctx!.fill();
    ctx!.fillStyle = `rgba(${CIANO},0.55)`;
    ctx!.fillRect(x - comp * 0.15, y - alt * 0.45, comp * 0.3, alt * 0.3);
    carimbar('232,255,246', x + (dir * comp) / 2, y, 7 * s + 2.5, 0.95);
    carimbar(VERMELHO, x - (dir * comp) / 2, y, 6 * s + 2, 0.9);
  }

  /* ── O trem elevado: de tempos em tempos, um trem iluminado cruza o viaduto ── */
  const trem = { x: 0, dir: 1, proximo: 2, ativo: false };
  const corTrilho = mistura([9, 30, 24], [2, 7, 6], Math.pow(ZTREM, 0.6));
  function desenharTrem(dt: number) {
    const s = escala(ZTREM);
    const base = chao(s);
    const y = base - H * 0.42 * s;
    const dx = desvioX(s);
    ctx!.fillStyle = `rgb(${corTrilho})`;
    const vao = 220 * s;
    for (let px = (dx % vao) - vao; px < W + vao; px += vao) ctx!.fillRect(px, y + 10 * s, 12 * s, base - y);
    ctx!.fillRect(0, y + 6 * s, W, 9 * s);
    ctx!.fillStyle = `rgba(${VERDE},0.35)`;
    ctx!.fillRect(0, y + 6 * s, W, Math.max(1, 1.2 * s));
    trem.proximo -= dt * RITMO;
    if (!trem.ativo && trem.proximo <= 0) {
      trem.ativo = true;
      trem.dir = -trem.dir;
      trem.x = trem.dir > 0 ? -1400 * s : W + 1400 * s;
    }
    if (!trem.ativo) return;
    trem.x += trem.dir * 900 * s * dt * RITMO;
    const vagao = 120 * s, alt = 24 * s, n = 7;
    for (let i = 0; i < n; i++) {
      const vx = trem.x - trem.dir * i * (vagao + 5 * s) + dx;
      if (vx < -vagao * 2 || vx > W + vagao * 2) continue;
      ctx!.fillStyle = '#0a1b16';
      ctx!.beginPath(); ctx!.roundRect(vx - vagao / 2, y - alt + 6 * s, vagao, alt, 5 * s); ctx!.fill();
      ctx!.fillStyle = `rgba(${JANELA},0.75)`;
      ctx!.fillRect(vx - vagao / 2 + 6 * s, y - alt + 12 * s, vagao - 12 * s, 6 * s);
      ctx!.fillStyle = `rgba(${VERDE},0.9)`;
      ctx!.fillRect(vx - vagao / 2, y + 3 * s, vagao, Math.max(1, 1.5 * s));
    }
    carimbar('232,255,246', trem.x + dx + (trem.dir * vagao) / 2, y - alt / 2 + 6 * s, 30 * s, 0.9);
    const cauda = trem.x - trem.dir * (n - 0.5) * (vagao + 5 * s) + dx;
    if ((trem.dir > 0 && cauda > W + 200) || (trem.dir < 0 && cauda < -200)) {
      trem.ativo = false;
      trem.proximo = 5 + Math.random() * 5;
    }
  }

  /* ── Holofotes varrendo o céu ── */
  function desenharHolofotes(t: number) {
    const s = escala(0.3);
    ctx!.save();
    ctx!.globalCompositeOperation = 'lighter';
    for (const h of HOLOFOTES) {
      const ox = h.x * W + desvioX(s), oy = chao(s) - H * 0.55 * s;
      const ang = -Math.PI / 2 + Math.sin(t * h.vel * RITMO + h.fase) * 0.45;
      const L = H * 1.3, abre = 0.07;
      const g = ctx!.createLinearGradient(ox, oy, ox + Math.cos(ang) * L, oy + Math.sin(ang) * L);
      g.addColorStop(0, `rgba(${h.cor},0.16)`);
      g.addColorStop(1, `rgba(${h.cor},0)`);
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.moveTo(ox, oy);
      ctx!.lineTo(ox + Math.cos(ang - abre) * L, oy + Math.sin(ang - abre) * L);
      ctx!.lineTo(ox + Math.cos(ang + abre) * L, oy + Math.sin(ang + abre) * L);
      ctx!.fill();
    }
    ctx!.restore();
  }

  /* ── O holograma: um cubo de arame girando sobre um prédio (oito pontos projetados, em 2D) ── */
  function desenharHolograma(t: number) {
    if (retrato) return; // na tela estreita, o cubo cairia em cima do texto
    const s = escala(HOLOGRAMA.z);
    const cx = HOLOGRAMA.x * W + desvioX(s), cy = chao(s) - H * HOLOGRAMA.alt * s - 120 * s;
    const tam = 46 * s;
    const a = t * 0.6 * RITMO, b = t * 0.37 * RITMO;
    const pts: [number, number][] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const X = x * Math.cos(a) - z * Math.sin(a);
      let Z = x * Math.sin(a) + z * Math.cos(a);
      const Y = y * Math.cos(b) - Z * Math.sin(b);
      Z = y * Math.sin(b) + Z * Math.cos(b);
      const p = 3.2 / (3.2 + Z);
      pts.push([cx + X * tam * p, cy + Y * tam * p]);
    }
    ctx!.save();
    ctx!.globalCompositeOperation = 'lighter';
    // o cone de projeção, de baixo para cima
    const g = ctx!.createLinearGradient(cx, cy + tam * 2.4, cx, cy - tam);
    g.addColorStop(0, `rgba(${CIANO},0.18)`);
    g.addColorStop(1, `rgba(${CIANO},0)`);
    ctx!.fillStyle = g;
    ctx!.beginPath(); ctx!.moveTo(cx - 4 * s, cy + tam * 2.4); ctx!.lineTo(cx - tam * 1.6, cy); ctx!.lineTo(cx + tam * 1.6, cy); ctx!.lineTo(cx + 4 * s, cy + tam * 2.4); ctx!.fill();
    ctx!.strokeStyle = `rgba(${CIANO},${Math.random() < 0.04 ? 0.3 : 0.85})`;
    ctx!.lineWidth = Math.max(1, 1.5 * s);
    ctx!.beginPath();
    for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) {
      const j = i ^ bit;
      if (j > i) { ctx!.moveTo(...pts[i]); ctx!.lineTo(...pts[j]); }
    }
    ctx!.stroke();
    ctx!.restore();
  }

  /* ── Chuva em três profundidades ── */
  let chuva: Chuva[] = [];
  function montarChuva() {
    const r = semente(3);
    chuva = [
      { n: 140, comp: 9, vel: 650, a: 0.16, w: 1 },
      { n: 90, comp: 16, vel: 950, a: 0.2, w: 1 },
      { n: 45, comp: 30, vel: 1500, a: 0.22, w: 1.5 },
    ].map((c) => ({ ...c, gotas: Array.from({ length: c.n }, () => [r() * W, r() * H]) }));
  }
  function desenharChuva(c: Chuva, dt: number) {
    const vento = 0.16;
    ctx!.strokeStyle = `rgba(${MENTA},${c.a})`;
    ctx!.lineWidth = c.w;
    ctx!.beginPath();
    for (const g of c.gotas) {
      g[1] += c.vel * dt * RITMO;
      g[0] -= c.vel * vento * dt * RITMO;
      if (g[1] > H) { g[1] = -c.comp; g[0] = Math.random() * (W + 100); }
      if (g[0] < -20) g[0] += W + 40;
      ctx!.moveTo(g[0], g[1]);
      ctx!.lineTo(g[0] + c.comp * vento, g[1] - c.comp);
    }
    ctx!.stroke();
  }

  function faixa(n: Faixa, x: number, y: number, alpha = 1) {
    const passo = n.largura;
    let ox = (((x % passo) + passo) % passo) - passo;
    ctx!.globalAlpha = alpha;
    for (; ox < W; ox += passo) ctx!.drawImage(n.c, ox, y, n.largura, n.altura);
    ctx!.globalAlpha = 1;
  }

  // Descarte de oclusão: percorre as camadas da frente para trás guardando, em faixas de 16 px da tela,
  // a partir de que altura tudo já está coberto. Cada coluna de trás só é desenhada até ali,
  // e o céu só até a linha mais baixa ainda visível.
  const FAIXA = 16;
  let oclusao = new Float32Array(0);
  function calcularOclusao() {
    const n = Math.ceil(W / FAIXA) + 1;
    if (oclusao.length !== n) oclusao = new Float32Array(n);
    oclusao.fill(H);
    for (let i = camadas.length - 1; i >= 0; i--) {
      const cam = camadas[i];
      const x = cam.x0 + desvioX(cam.s), y = chao(cam.s) - cam.alto;
      for (const k of cam.colunas) {
        const dx = x + k.x;
        const b0 = Math.max(0, Math.floor(dx / FAIXA)), b1 = Math.min(n - 1, Math.floor((dx + k.w) / FAIXA));
        let fundo = 0;
        for (let b = b0; b <= b1; b++) fundo = Math.max(fundo, oclusao[b]);
        k.ate = Math.ceil(fundo - y + 2);
      }
      for (const k of cam.colunas) {
        k.opaco.forEach((o, j) => {
          const dx = x + k.x + j * 32, yo = y + o;
          // só as faixas inteiramente dentro da fatia podem ser dadas como cobertas
          for (let b = Math.ceil(dx / FAIXA); (b + 1) * FAIXA <= dx + 32 && b < n; b++) if (b >= 0 && yo < oclusao[b]) oclusao[b] = yo;
        });
      }
    }
    let linha = 0;
    for (let b = 0; b < n; b++) linha = Math.max(linha, oclusao[b]);
    return linha;
  }

  function desenharCamada(cam: Camada, t: number) {
    const s = cam.s, base = chao(s), x = cam.x0 + desvioX(s), y = base - cam.alto;
    if (y > H) return;
    for (const k of cam.colunas) {
      const dx = x + k.x;
      const h = Math.min(k.h, k.ate - k.y);
      if (dx > W || dx + k.w < 0 || y + k.y > H || h <= 0) continue;
      ctx!.drawImage(cam.c, k.x * dpr, k.y * dpr, k.w * dpr, h * dpr, dx, y + k.y, k.w, h);
    }
    // o chão daquela distância, só até onde o chão da próxima camada começa a cobrir
    const ate = Math.min(H, cam.proximoChao ? cam.proximoChao() : H);
    if (base < ate) {
      ctx!.fillStyle = `rgb(${cam.corPredio})`;
      ctx!.fillRect(0, base - 1, W, ate - base + 1);
      // a rua molhada: a faixa logo abaixo da base reflete o verde
      ctx!.fillStyle = `rgba(${VERDE},${0.05 + 0.08 * cam.z})`;
      ctx!.fillRect(0, base, W, Math.min(ate - base, 26 * s + 4));
      ctx!.fillStyle = `rgba(${VERDE},${0.12 + 0.15 * cam.z})`;
      ctx!.fillRect(0, base, W, Math.max(1, 1.5 * s));
    }
    // janelas que acendem e apagam
    for (const j of cam.janelasVivas) {
      if (t > j.ate) { j.acesa = !j.acesa; j.ate = t + (j.acesa ? 2 + Math.random() * 8 : 1 + Math.random() * 6) / RITMO; }
      if (j.acesa) { ctx!.fillStyle = `rgba(${j.cor},0.75)`; ctx!.fillRect(x + j.x, y + j.y, j.w, j.h); }
    }
    // luzes de aviação piscando
    for (const l of cam.luzes) carimbar(VERMELHO, x + l.x, y + l.y, l.r, Math.pow((Math.sin(t * 2.2 * RITMO + l.fase) + 1) / 2, 6));
    // o pulso de luz correndo pelas fitas de LED
    for (const f of cam.fitas) {
      const subida = f.y0 - f.y1;
      const d = ((t * f.vel * RITMO + f.fase) % 1) * (subida + f.x1 - f.x);
      carimbar(f.cor, x + (d < subida ? f.x : f.x + d - subida), y + (d < subida ? f.y0 - d : f.y1), 10 * s + 3, 0.95);
    }
    // letreiros: acesos com um zumbido leve; de vez em quando, falham
    for (const l of cam.letreiros) {
      if (t > l.proximo) { l.falha = t + 0.25 + Math.random() * 0.5; l.proximo = t + (3 + Math.random() * 9) / RITMO; }
      const falhando = t < l.falha && Math.random() < 0.55;
      ctx!.globalAlpha = falhando ? 1 : 0.88 + 0.12 * Math.sin(t * 40);
      ctx!.drawImage(falhando ? l.placa.apagado : l.placa.aceso, x + l.x - 8, y + l.y - 8, l.placa.w, l.placa.h);
      ctx!.globalAlpha = 1;
      if (!falhando) carimbar(l.cor, x + l.x + l.placa.w / 2 - 8, y + l.y + l.placa.h / 2 - 8, l.placa.h * 0.7, 0.18);
    }
  }

  // A ordem de desenho (de trás para a frente, com o que vive entre as camadas), montada uma vez
  let ordem: { z: number; f: (t: number, dt: number) => void }[] = [];
  function montarOrdem() {
    ordem = [
      ...camadas.map((c) => ({ z: c.z - 0.0001, f: (t: number) => desenharCamada(c, t) })),
      { z: ZTORRE, f: (t: number) => desenharTorre(t) },
      { z: ZTREM, f: (_: number, dt: number) => desenharTrem(dt) },
      { z: HOLOGRAMA.z + 0.001, f: (t: number) => desenharHolograma(t) },
      { z: 0.62, f: (t: number) => { if (!leve) faixa(neblina, t * 20 * RITMO + desvioX(0.55), chao(escala(0.62)) - H * 0.32, 0.55); } },
      { z: 0.55, f: (_: number, dt: number) => { if (!leve) desenharChuva(chuva[0], dt); } },
      ...carros.map((c) => ({ z: c.z, f: (t: number, dt: number) => desenharCarro(c, dt, t) })),
    ].sort((a, b) => a.z - b.z);
  }

  /* ── Montagem ── */
  function montar() {
    W = palco.clientWidth; H = palco.clientHeight;
    if (!W || !H) return;
    retrato = W < 768;
    dpr = minimo ? 1 : Math.min(devicePixelRatio || 1, 2);
    tela.width = Math.round(W * dpr);
    tela.height = Math.round(H * dpr);
    horizonte = H * (retrato ? 0.42 : 0.5);
    montarCeu();
    nuvensFundo = montarNuvens(11, W * 1.6, H * 0.3, 70, 0.55);
    nuvensFrente = montarNuvens(23, W * 1.4, H * 0.4, 80, 0.75);
    neblina = montarNuvens(31, W * 1.5, H * 0.25, 60, 0.35);
    camadas = PROFUNDIDADES.map(montarCamada);
    camadas.forEach((c, i) => { const prox = camadas[i + 1]; if (prox) c.proximoChao = () => chao(prox.s); });
    montarTorre();
    montarTrafego();
    montarChuva();
    montarOrdem();
    if (el.trafego) el.trafego.textContent = String(carros.length);
  }

  /* ── O laço de cada quadro ── */
  let raf = 0, anterior = performance.now(), tempo = 0, relampago = 0, proximoRelampago = 9, ultimoEstado = '';
  let quadros = 0, marco = performance.now(), lentos = 0;
  let visivel = true;

  function quadro(agora: number) {
    raf = 0;
    const dt = Math.min(0.05, (agora - anterior) / 1000);
    anterior = agora;
    tempo += dt;
    const t = tempo;
    const k = 1 - Math.exp(-dt * 3);
    mx += (alvoMx - mx) * k;
    my += (alvoMy - my) * k;

    const curso = Math.max(1, topo.offsetHeight - palco.offsetHeight);
    const bruto = Math.min(1, Math.max(0, -topo.getBoundingClientRect().top / curso));
    rolagem += (bruto * bruto * (3 - 2 * bruto) - rolagem) * (1 - Math.exp(-dt * 8)); // a câmera desce com amortecimento

    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const linhaCeu = Math.min(H, calcularOclusao() + 2);
    const yCeu = -rolagem * H * 0.12 - my * 4;
    ctx!.drawImage(ceu!, 0, 0, ceu!.width, ((linhaCeu - yCeu) / (H * 1.2)) * ceu!.height, 0, yCeu, W, linhaCeu - yCeu);

    // relâmpago raro, iluminando o céu por trás da cidade (nunca para quem pede menos movimento)
    if (!calmo && t > proximoRelampago) { relampago = 1; proximoRelampago = t + 14 + Math.random() * 12; }
    if (relampago > 0) {
      ctx!.fillStyle = `rgba(160,255,215,${relampago * (0.5 + 0.5 * Math.sin(t * 90)) * 0.12})`;
      ctx!.fillRect(0, 0, W, horizonte + H * 0.1);
      relampago = Math.max(0, relampago - dt * 3.5);
    }
    faixa(nuvensFundo, -t * 6 * RITMO + desvioX(0.05), H * 0.06 - rolagem * H * 0.15, 0.9);
    desenharHolofotes(t);
    for (const item of ordem) item.f(t, dt);
    desenharChuva(chuva[1], dt);
    desenharChuva(chuva[2], dt);
    // as nuvens da altura da câmera: na frente de tudo no começo, somem para cima ao descer
    if (rolagem < 0.6 && !leve) faixa(nuvensFrente, -t * 18 * RITMO + desvioX(1.3), -H * 0.12 - rolagem * H * 1.4 + my * 10, 0.85 * (1 - rolagem));

    // a página por cima: só é tocada quando algo mudou
    const ty = -rolagem * H * 0.18 - my * 5;
    const estado = `${(-mx * 8).toFixed(1)},${ty.toFixed(1)},${rolagem.toFixed(3)}`;
    if (estado !== ultimoEstado) {
      ultimoEstado = estado;
      if (el.texto) {
        el.texto.style.transform = `translate3d(${-mx * 8}px, ${ty}px, 0)`;
        el.texto.style.opacity = String(1 - suave(0.55, 0.95, rolagem));
      }
      palco.style.setProperty('--fim', suave(0.6, 1, rolagem).toFixed(3));
      if (el.role) el.role.style.opacity = String(1 - suave(0, 0.08, rolagem));
      if (el.altitude) el.altitude.textContent = String(Math.round(12 + (1 - rolagem) * 300));
    }

    quadros++;
    if (agora - marco > 1000) {
      const fps = quadros / ((agora - marco) / 1000);
      if (el.qps) el.qps.textContent = String(Math.round(fps));
      // dois segundos seguidos abaixo de 48: entra no modo leve (sem neblina, nuvens da frente e a chuva do
      // fundo); se nem assim segurar, desenha com menos pixels (só em telas de alta densidade, como as de celular)
      lentos = fps < 48 ? lentos + 1 : 0;
      if (lentos >= 2) {
        if (!leve) leve = true;
        else if (!minimo && dpr > 1) { minimo = true; montar(); }
        lentos = 0;
      }
      quadros = 0; marco = agora;
    }
    pedir();
  }

  function pedir() { if (ceu && !raf && visivel && !document.hidden) raf = requestAnimationFrame(quadro); }
  const aoVisibilidade = () => { anterior = performance.now(); pedir(); };
  const aoMover = (e: PointerEvent) => {
    alvoMx = (e.clientX / innerWidth) * 2 - 1;
    alvoMy = (e.clientY / innerHeight) * 2 - 1;
  };
  const visao = new IntersectionObserver(([e]) => { visivel = e.isIntersecting; if (visivel) aoVisibilidade(); });
  let esperaMontar = 0;
  const tamanho = new ResizeObserver(() => { clearTimeout(esperaMontar); esperaMontar = window.setTimeout(montar, 150); });

  let vivo = true;
  // os letreiros usam a fonte mono do site: espera ela carregar antes de desenhar
  document.fonts.load(`700 20px ${mono}`).catch(() => {}).finally(() => {
    if (!vivo) return;
    montar();
    visao.observe(palco);
    tamanho.observe(palco);
    document.addEventListener('visibilitychange', aoVisibilidade);
    addEventListener('pointermove', aoMover, { passive: true });
    pedir();
  });

  return () => {
    vivo = false;
    cancelAnimationFrame(raf);
    clearTimeout(esperaMontar);
    visao.disconnect();
    tamanho.disconnect();
    document.removeEventListener('visibilitychange', aoVisibilidade);
    removeEventListener('pointermove', aoMover);
  };
}
