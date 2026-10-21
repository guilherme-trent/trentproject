'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { detectInitialTier, TIER_PROFILES, type PerformanceTier } from '@/engine/config/performance';

const NOME_DO_NIVEL: Record<PerformanceTier, string> = { high: 'ALTA', mid: 'MÉDIA', low: 'LEVE' };

/** "ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)" → "Intel UHD Graphics 620" */
function nomeDaGpu(bruto: string) {
  let s = bruto;
  const angle = s.match(/^ANGLE \((.*)\)$/);
  if (angle) s = angle[1].split(', ')[1] ?? angle[1];
  s = s.replace(/^ANGLE \w+ Renderer: /, '').replace(/\(R\)|\(TM\)|Mesa |Direct3D.*$|OpenGL.*$|vs_\d.*$|ps_\d.*$/gi, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
  return s.length > 38 ? `${s.slice(0, 37)}…` : s || 'não informada';
}

function lerAparelho() {
  let gpu = 'não informada';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = nomeDaGpu(String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
      gl.getExtension('WEBGL_lose_context')?.loseContext(); // devolve o contexto na hora
    }
  } catch {
    /* sem WebGL */
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const nivel = detectInitialTier();
  const perfil = TIER_PROFILES[nivel];
  return {
    gpu,
    nucleos: nav.hardwareConcurrency ? String(nav.hardwareConcurrency) : 'não informado',
    memoria: nav.deviceMemory ? `${nav.deviceMemory} GB ou mais` : 'não informada pelo navegador',
    tela: `${screen.width}×${screen.height} · densidade ${Math.round(devicePixelRatio * 100) / 100}x`,
    toque: matchMedia('(pointer: coarse)').matches ? 'sim' : 'não',
    nivel,
    efeitos: perfil.bloom
      ? `brilho com ${perfil.bloom.levels} níveis${perfil.shadows ? ', sombras ligadas' : ''}, ${Math.round(perfil.particleBudget * 100)}% das partículas`
      : `sem pós-processamento, ${Math.round(perfil.particleBudget * 100)}% das partículas`,
  };
}

/**
 * O Regente analisa o aparelho de quem visita, ao vivo: um terminal que liga sozinho quando aparece e
 * digita o diagnóstico real (a mesma regra que o motor usa para escolher a qualidade da experiência),
 * com os quadros por segundo medidos na hora num gráfico correndo. Nada sai do navegador.
 */
export function Diagnostico() {
  const raiz = useRef<HTMLDivElement>(null);
  const saida = useRef<HTMLPreElement>(null);
  const grafico = useRef<HTMLCanvasElement>(null);
  const qps = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = raiz.current;
    const pre = saida.current;
    const canvas = grafico.current;
    if (!el || !pre || !canvas) return;
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    let visivel = false;
    let comecou = false;
    let raf = 0;
    const timers: number[] = [];

    // Quadros por segundo, medidos sempre (é o número que o motor também olha)
    const amostras: number[] = [];
    let quadros = 0;
    let marco = performance.now();
    const desenharGrafico = () => {
      if (!ctx) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // grade
      ctx.strokeStyle = 'rgba(167, 243, 208, 0.08)';
      ctx.lineWidth = 1;
      for (let y = 0; y <= h; y += h / 4) {
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
        ctx.stroke();
      }
      if (amostras.length < 2) return;
      const max = 75;
      const passo = w / 59;
      const y = (v: number) => h - (Math.min(v, max) / max) * (h - 6) - 3;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(110, 231, 183, 0.35)');
      grad.addColorStop(1, 'rgba(110, 231, 183, 0)');
      const x0 = w - (amostras.length - 1) * passo;
      ctx.beginPath();
      amostras.forEach((v, i) => (i ? ctx.lineTo(x0 + i * passo, y(v)) : ctx.moveTo(x0, y(v))));
      ctx.lineTo(w, h);
      ctx.lineTo(x0, h);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      amostras.forEach((v, i) => (i ? ctx.lineTo(x0 + i * passo, y(v)) : ctx.moveTo(x0, y(v))));
      ctx.strokeStyle = '#6ee7b7';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#6ee7b7';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    const medir = (agora: number) => {
      quadros++;
      if (agora - marco >= 250) {
        const v = (quadros * 1000) / (agora - marco);
        amostras.push(v);
        if (amostras.length > 60) amostras.shift();
        if (qps.current) qps.current.textContent = String(Math.round(v));
        quadros = 0;
        marco = agora;
        if (visivel) desenharGrafico();
      }
      raf = requestAnimationFrame(medir);
    };
    raf = requestAnimationFrame(medir);

    // O terminal digitando
    const digitar = () => {
      const a = lerAparelho();
      const linhas: [string, string][] = [
        ['cmd', '> regente --diagnostico'],
        ['', ''],
        ['par', `placa de vídeo ... ${a.gpu}`],
        ['par', `núcleos ......... ${a.nucleos}`],
        ['par', `memória ......... ${a.memoria}`],
        ['par', `tela ............ ${a.tela}`],
        ['par', `toque ........... ${a.toque}`],
        ['', ''],
        ['par', `nível escolhido . ${NOME_DO_NIVEL[a.nivel]}`],
        ['par', `efeitos ......... ${a.efeitos}`],
        ['', ''],
        ['ok', `> pronto. A experiência vai rodar em qualidade ${NOME_DO_NIVEL[a.nivel]} no seu aparelho,`],
        ['ok', '  e o Regente continua ajustando em tempo real se precisar.'],
      ];
      if (calmo) {
        pre.textContent = linhas.map(([, t]) => t).join('\n');
        return;
      }
      pre.textContent = '';
      let t = 300;
      for (const [, texto] of linhas) {
        const inicio = t;
        const linha = texto;
        timers.push(window.setTimeout(() => {
          const span = document.createElement('span');
          pre.append(span, '\n');
          let i = 0;
          const tecla = () => {
            span.textContent = linha.slice(0, ++i);
            if (i < linha.length) timers.push(window.setTimeout(tecla, linha.startsWith('>') ? 26 : 9));
          };
          if (linha) tecla();
        }, inicio));
        t += linha.startsWith('> regente') ? 900 : Math.max(120, linha.length * 10 + 90);
      }
      timers.push(window.setTimeout(() => el.classList.add('concluido'), t + 200));
    };

    const observador = new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting;
      if (visivel && !comecou) {
        comecou = true;
        digitar();
      }
    }, { threshold: 0.3 });
    observador.observe(el);

    return () => {
      observador.disconnect();
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div ref={raiz} className="diagnostico cartao cantos">
      <div className="diagnostico-cabeca">
        <span><i className="ponto-vivo" /> REGENTE · DIAGNÓSTICO AO VIVO</span>
        <span>CALCULADO NO SEU NAVEGADOR · NADA É ENVIADO</span>
      </div>
      <div className="diagnostico-corpo">
        <pre ref={saida} className="diagnostico-saida" aria-live="polite" />
        <div className="diagnostico-grafico">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--texto-fraco)]">Quadros por segundo, agora</p>
          <p className="mt-1 font-serif text-5xl font-light text-white">
            <span ref={qps}>--</span>
          </p>
          <canvas ref={grafico} aria-hidden="true" />
          <Link href="/experiencia" className="botao botao-principal mt-5 self-start">Entrar na experiência</Link>
        </div>
      </div>
    </div>
  );
}
