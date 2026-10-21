'use client';

import { useEffect, useRef } from 'react';
import { medirQuadro } from './quadro';

/**
 * O topo como painel de controle: a mira holográfica em volta da árvore e a telemetria ao vivo
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

/**
 * Pontos de interesse da árvore, nas coordenadas do quadro do vídeo (largo 1920×1080; retrato 720×1280).
 * `peso`: o quanto o olho gosta de olhar para ali sozinho (os frutos atraem mais). Os frutos seguem as
 * cores dos pilares da experiência: dourado = Experience, verde = Architecture, azul = Performance.
 */
const ALVOS = [
  { nome: 'FRUTO · EXPERIENCE', sobre: 'Tecnologia que se sente', larga: [625, 340], retrato: [160, 432], peso: 3 },
  { nome: 'FRUTO · ARCHITECTURE', sobre: 'Estruturas que seguram o caos', larga: [1240, 405], retrato: [532, 482], peso: 3 },
  { nome: 'FRUTO · PERFORMANCE', sobre: 'Cada milissegundo é uma decisão', larga: [1440, 435], retrato: [668, 496], peso: 3 },
  { nome: 'COPA', sobre: 'Os galhos se entrelaçam em tranças', larga: [1000, 250], retrato: [380, 330], peso: 2 },
  { nome: 'GALHO · PONTA', sobre: 'Desenhado do tronco até a ponta', larga: [540, 130], retrato: [70, 280], peso: 1 },
  { nome: 'GALHO · PONTA', sobre: 'Desenhado do tronco até a ponta', larga: [1500, 225], retrato: [690, 335], peso: 1 },
  { nome: 'TRONCO', sobre: 'Milhares de linhas do tempo torcidas', larga: [960, 600], retrato: [365, 640], peso: 2 },
  { nome: 'RAÍZES', sobre: 'Onde a seiva começa a subir', larga: [960, 900], retrato: [360, 880], peso: 1.5 },
] as const;

/**
 * A mira como um olho. Sozinha, ela escolhe para onde olhar (prefere os frutos e os pontos mais perto,
 * nunca repete o anterior), desliza até lá numa mola amortecida, sem pulos, e "foca": a íris e a pupila
 * se contraem e aparece o que ela está vendo. Parada, treme de leve, como um olho de verdade, e às vezes pisca.
 * Com o mouse sobre a árvore, o olho vira o cursor: segue o ponteiro e mostra o que há em cada parte.
 * No toque, segue o dedo. Pausa fora da tela.
 */
export function Olho() {
  const olho = useRef<HTMLDivElement>(null);
  const nome = useRef<HTMLSpanElement>(null);
  const sobre = useRef<HTMLSpanElement>(null);
  const coord = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = olho.current;
    const caixa = el?.parentElement;
    const secao = caixa?.closest<HTMLElement>('section');
    const capa = caixa?.querySelector<HTMLImageElement>('.video-arvore img');
    if (!el || !caixa || !secao || !capa) return;
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let q = medirQuadro(caixa, capa);
    let tam = el.offsetWidth;
    const naTela = (i: number) => {
      const [x, y] = q.retrato ? ALVOS[i].retrato : ALVOS[i].larga;
      return [q.ox + x * q.escala, q.oy + y * q.escala] as const;
    };
    const mostrar = (i: number | null, mx = 0) => {
      if (nome.current) nome.current.textContent = i === null ? 'VARRENDO' : ALVOS[i].nome;
      if (sobre.current) sobre.current.textContent = i === null ? 'Passe sobre um fruto, o tronco ou as raízes' : ALVOS[i].sobre;
      el.classList.toggle('lado-esquerdo', (i === null ? mx : naTela(i)[0]) > caixa.clientWidth * 0.6);
    };

    // Sozinho: o próximo alvo é perto e interessante, nunca o mesmo
    let atual = 6; // começa no tronco
    const proximo = () => {
      const [ax, ay] = naTela(atual);
      const opcoes = ALVOS.map((a, i) => {
        if (i === atual) return 0;
        const [x, y] = naTela(i);
        return a.peso / (0.35 + Math.hypot(x - ax, y - ay) / Math.max(1, caixa.clientWidth));
      });
      let sorteio = Math.random() * opcoes.reduce((s, v) => s + v, 0);
      for (let i = 0; i < opcoes.length; i++) if ((sorteio -= opcoes[i]) <= 0) return i;
      return (atual + 1) % ALVOS.length;
    };

    // A mola amortecida. Seguindo o ponteiro, ela fica bem mais firme (responde na hora, mas sem tremer)
    let [x, y] = naTela(atual);
    let vx = 0;
    let vy = 0;
    let alvoX = x;
    let alvoY = y;
    let tremorX = 0;
    let tremorY = 0;
    let fixadoDesde = 0;
    let fixacao = 0;
    let focado = false;
    let proximoTremor = 0;
    let proximaPiscada = performance.now() + 4000 + Math.random() * 5000;
    let ponteiro: { x: number; y: number; ate: number } | null = null;

    const mirar = (i: number) => {
      atual = i;
      [alvoX, alvoY] = naTela(i);
      fixadoDesde = 0;
      fixacao = 1500 + Math.random() * 1600;
      mostrar(i);
    };

    // O ponteiro sobre a árvore (fora do texto e dos botões) vira o olho
    const aoMover = (e: PointerEvent) => {
      const r = caixa.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const sobreArvore = px >= 0 && py >= 0 && px <= r.width && py <= r.height
        && !(e.target as HTMLElement).closest('a, button, h1, p, .telemetria') && // em cima do texto, o ponteiro é do texto
        (q.retrato || px > r.width * 0.12);
      secao.classList.toggle('olho-cursor', sobreArvore && e.pointerType === 'mouse');
      if (!sobreArvore) {
        if (ponteiro) ponteiro.ate = 0;
        return;
      }
      // com o mouse, o olho fica onde o ponteiro está até ele sair da árvore; no toque, volta sozinho depois
      ponteiro = { x: px, y: py, ate: e.pointerType === 'mouse' ? Infinity : performance.now() + 3500 };
      // o ponto da árvore mais perto do ponteiro, se estiver perto o bastante
      let melhor: number | null = null;
      let menor = 90 + tam * 0.25;
      ALVOS.forEach((_, i) => {
        const [ax, ay] = naTela(i);
        const d = Math.hypot(ax - px, ay - py);
        if (d < menor) { menor = d; melhor = i; }
      });
      mostrar(melhor, px);
    };
    const aoSair = () => {
      secao.classList.remove('olho-cursor');
      if (ponteiro) ponteiro.ate = 0;
    };

    let anterior = performance.now();
    let raf = 0;
    let rodando = false;
    const quadro = (agora: number) => {
      const dt = Math.min(0.05, (agora - anterior) / 1000);
      anterior = agora;
      const seguindo = ponteiro !== null && agora < ponteiro.ate;
      if (ponteiro && !seguindo) {
        // o ponteiro saiu (ou parou): volta a olhar sozinho a partir de onde está
        ponteiro = null;
        focado = false;
        el.classList.remove('focado');
        mirar(proximo());
      }
      if (seguindo) {
        alvoX = ponteiro!.x;
        alvoY = ponteiro!.y;
        if (!focado) { focado = true; el.classList.add('focado'); }
      } else if (focado && agora > proximoTremor) {
        // tremores mínimos enquanto fixa o olhar (como um olho de verdade)
        tremorX = (Math.random() - 0.5) * 5;
        tremorY = (Math.random() - 0.5) * 5;
        proximoTremor = agora + 350 + Math.random() * 600;
      }
      const rigidez = seguindo ? 220 : calmo ? 9 : 16;
      const amortecimento = 2 * Math.sqrt(rigidez);
      const tx = alvoX + (focado && !seguindo ? tremorX : 0);
      const ty = alvoY + (focado && !seguindo ? tremorY : 0);
      vx += (rigidez * (tx - x) - amortecimento * vx) * dt;
      vy += (rigidez * (ty - y) - amortecimento * vy) * dt;
      x += vx * dt;
      y += vy * dt;
      if (!seguindo) {
        const parado = Math.hypot(vx, vy) < 18 && Math.hypot(alvoX - x, alvoY - y) < 10;
        if (parado && !focado) {
          focado = true;
          fixadoDesde = agora;
          el.classList.add('focado');
        }
        if (focado && fixadoDesde && agora - fixadoDesde > fixacao) {
          focado = false;
          el.classList.remove('focado');
          mirar(proximo());
        }
      }
      if (!calmo && !seguindo && agora > proximaPiscada) {
        el.classList.add('piscando');
        setTimeout(() => el.classList.remove('piscando'), 140);
        proximaPiscada = agora + 5000 + Math.random() * 6000;
      }
      el.style.transform = `translate3d(${x - tam / 2}px, ${y - tam / 2}px, 0)`;
      if (coord.current) {
        const fx = Math.max(0, (x - q.ox) / q.escala).toFixed(0).padStart(4, '0');
        const fy = Math.max(0, (y - q.oy) / q.escala).toFixed(0).padStart(4, '0');
        coord.current.textContent = `X ${fx} · Y ${fy}`;
      }
      raf = requestAnimationFrame(quadro);
    };
    const ligar = (sim: boolean) => {
      if (sim === rodando) return;
      rodando = sim;
      cancelAnimationFrame(raf);
      if (sim) {
        anterior = performance.now();
        raf = requestAnimationFrame(quadro);
      }
    };

    const aoMudar = () => {
      q = medirQuadro(caixa, capa);
      tam = el.offsetWidth;
      if (!ponteiro) [alvoX, alvoY] = naTela(atual);
    };
    mirar(atual);
    if (!capa.complete) capa.addEventListener('load', aoMudar, { once: true });
    const redimensionar = new ResizeObserver(aoMudar);
    redimensionar.observe(caixa);
    const observador = new IntersectionObserver(([e]) => ligar(e.isIntersecting));
    observador.observe(caixa);
    secao.addEventListener('pointermove', aoMover, { passive: true });
    secao.addEventListener('pointerdown', aoMover, { passive: true });
    secao.addEventListener('pointerleave', aoSair);
    const surgir = setTimeout(() => el.classList.add('vivo'), 900);

    return () => {
      ligar(false);
      redimensionar.disconnect();
      observador.disconnect();
      secao.removeEventListener('pointermove', aoMover);
      secao.removeEventListener('pointerdown', aoMover);
      secao.removeEventListener('pointerleave', aoSair);
      clearTimeout(surgir);
    };
  }, []);

  const marcas = Array.from({ length: 48 }, (_, i) => i);
  return (
    <div ref={olho} className="olho" aria-hidden="true">
      <svg className="mira" viewBox="-100 -100 200 200">
        <g className="anel anel-1">
          <circle r="96" />
          {marcas.map((i) => (
            <line key={i} x1="0" y1="-96" x2="0" y2={i % 4 === 0 ? -88 : -92} transform={`rotate(${i * 7.5})`} />
          ))}
        </g>
        <g className="anel anel-2">
          <circle r="78" strokeDasharray="34 12 4 12" />
        </g>
        <g className="iris">
          <g className="anel anel-3">
            <circle r="58" strokeDasharray="2 6" />
            <path d="M -58 0 A 58 58 0 0 1 -41 -41" className="arco" />
            <path d="M 58 0 A 58 58 0 0 1 41 41" className="arco" />
          </g>
          <circle r="22" className="pupila" />
        </g>
        <g className="cruz">
          <line x1="-100" y1="0" x2="-84" y2="0" />
          <line x1="84" y1="0" x2="100" y2="0" />
          <line x1="0" y1="-100" x2="0" y2="-84" />
          <line x1="0" y1="84" x2="0" y2="100" />
        </g>
      </svg>
      <div className="olho-rotulo">
        <span ref={nome} className="olho-nome">TRONCO</span>
        <span ref={sobre} className="olho-sobre">Milhares de linhas do tempo torcidas</span>
        <span ref={coord} className="olho-coord">X 0000 · Y 0000</span>
      </div>
    </div>
  );
}
