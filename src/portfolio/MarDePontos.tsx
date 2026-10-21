'use client';

import { useEffect, useRef } from 'react';

/**
 * O mar de pontos do topo: uma grade de pontos sobre um plano, vista em perspectiva, que ondula sozinha.
 * As cristas acendem e os vales apagam. O ponteiro (ou o dedo) passa como um dedo na água: ergue o mar
 * onde está, solta ondulações quando anda e uma mais forte no clique. De tempos em tempos nasce uma
 * ondulação sozinha, num ponto qualquer, e um feixe de varredura atravessa o mar.
 *
 * Leve de propósito: a grade (posição de cada ponto no plano) é montada uma vez e vai para a placa de vídeo;
 * a altura das ondas é calculada no shader de vértices, todos os pontos em paralelo, numa única chamada de
 * desenho por quadro. O JavaScript só atualiza o relógio e as ondulações. Pausa fora da tela.
 * Sem WebGL, o topo fica só com o texto (nada aqui é necessário para ler o portfólio).
 */

const MAX_ONDULACOES = 10;

const VERTICES = `
attribute vec3 aPonto; // x e z no plano; f = distância normalizada (0 perto, 1 no horizonte)
uniform vec2 uTela;     // largura e altura em px CSS
uniform vec3 uCamera;   // ponto de fuga (x), horizonte (y), distância focal (z)
uniform float uAltura;  // altura da câmera sobre o plano
uniform float uTempo;
uniform float uDpr;
uniform float uTamanho;
uniform float uVarredura;
uniform vec3 uAlvo;     // ponteiro no plano (x, z) e a força dele (0 a 1, entra e sai suave)
uniform vec4 uOndulacoes[${MAX_ONDULACOES}]; // x, z, idade, força
varying float vLuz;

void main() {
  float x = aPonto.x, z = aPonto.y, f = aPonto.z, t = uTempo;
  // três ondas somadas, rolando na direção de quem olha
  float y = 0.7 * sin(x * 0.3 + t * 0.55) * cos(z * 0.2 - t * 0.7)
          + 0.45 * sin((x + z) * 0.16 - t * 0.9)
          + 0.2 * sin(x * 0.85 - z * 0.55 + t * 1.25);
  // as ondulações: um anel que se abre e perde força. Nasce suave (sem estalo) e só é ignorado
  // onde a onda já é imperceptível (sem corte seco na borda)
  for (int i = 0; i < ${MAX_ONDULACOES}; i++) {
    vec4 o = uOndulacoes[i];
    if (o.w <= 0.0) continue;
    float d = distance(vec2(x, z), o.xy) - o.z * 3.2;
    if (abs(d) < 4.5) y += o.w * exp(-d * d * 0.45) * cos(d * 1.6) * exp(-o.z * 0.6) * smoothstep(0.0, 0.35, o.z);
  }
  // o ponteiro: o mar se ergue de leve onde ele está, como um dedo passando por baixo da água
  vec2 alvo = vec2(x, z) - uAlvo.xy;
  float perto = exp(-dot(alvo, alvo) * 0.35) * uAlvo.z;
  y += 0.45 * perto;
  float proj = uCamera.z / z;
  vec2 tela = vec2(uCamera.x + x * proj, uCamera.y + (uAltura - y) * proj);

  // brilho: a crista acende, a distância apaga; o feixe e o ponteiro realçam
  float nevoa = 0.3 + 0.7 * pow(1.0 - f, 1.1);
  float luz = (0.28 + 0.72 * clamp((y + 1.2) / 2.4, 0.0, 1.0)) * nevoa;
  float dv = z - uVarredura;
  luz += 0.35 * exp(-dv * dv * 0.6) * nevoa;
  luz += 0.45 * perto * nevoa;
  vLuz = min(1.0, luz);

  gl_Position = vec4(tela.x / uTela.x * 2.0 - 1.0, 1.0 - tela.y / uTela.y * 2.0, 0.0, 1.0);
  gl_PointSize = max(1.1, uTamanho * pow(2.4 / z, 0.7)) * (0.75 + 0.5 * vLuz) * uDpr;
}`;

const FRAGMENTOS = `
precision mediump float;
varying float vLuz;
void main() {
  // ponto redondo com a borda suave
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.3, d) * (0.7 + 0.3 * vLuz) * smoothstep(0.03, 0.1, vLuz);
  // do esmeralda apagado ao menta quase branco (as cristas)
  vec3 cor = mix(vec3(0.06, 0.43, 0.33), vec3(0.89, 1.0, 0.93), vLuz * vLuz);
  gl_FragColor = vec4(cor * a, a);
}`;

interface Ondulacao { x: number; z: number; inicio: number; forca: number }

export function MarDePontos() {
  const tela = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = tela.current;
    const secao = canvas?.closest('section');
    const gl = canvas?.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' });
    if (!canvas || !secao || !gl) return;
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const RITMO = calmo ? 0.55 : 1; // reduzir, não eliminar
    const ALTURA = 2.6; // altura da câmera sobre o plano: baixa, rente ao mar

    const programa = gl.createProgram()!;
    for (const [tipo, fonte] of [[gl.VERTEX_SHADER, VERTICES], [gl.FRAGMENT_SHADER, FRAGMENTOS]] as const) {
      const s = gl.createShader(tipo)!;
      gl.shaderSource(s, fonte);
      gl.compileShader(s);
      gl.attachShader(programa, s);
    }
    gl.bindAttribLocation(programa, 0, 'aPonto');
    gl.linkProgram(programa);
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) return;
    gl.useProgram(programa);
    const u = (nome: string) => gl.getUniformLocation(programa, nome);
    const uTela = u('uTela'), uCamera = u('uCamera'), uAltura = u('uAltura'), uTempo = u('uTempo'), uDpr = u('uDpr');
    const uTamanho = u('uTamanho'), uVarredura = u('uVarredura'), uAlvo = u('uAlvo'), uOndulacoes = u('uOndulacoes');
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    let W = 0, H = 0, horizonte = 0, fuga = 0, focal = 0, n = 0;
    function montar() {
      const r = canvas!.getBoundingClientRect();
      W = r.width; H = r.height;
      if (!W || !H) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      const retrato = W < 768;
      // no computador o ponto de fuga fica à direita do nome; no celular, o mar ocupa o alto da tela
      horizonte = H * (retrato ? 0.2 : 0.3);
      fuga = W * (retrato ? 0.5 : 0.66);
      focal = retrato ? W * 1.15 : H * 0.95;

      // Uma grade fixa no mundo (passo constante em x): os pontos formam linhas que convergem para o ponto
      // de fuga, como numa perspectiva de verdade. Cada linha só gera os pontos que caem dentro da tela.
      const linhas = retrato ? 44 : 50, passo = retrato ? 0.2 : 0.18;
      const perto = 2.4, longe = 30;
      const pontos: number[] = [];
      for (let j = 0; j < linhas; j++) {
        const f = j / (linhas - 1);
        const z = perto * Math.pow(longe / perto, f); // linhas em progressão geométrica: densidade parecida na tela
        const esquerda = ((-fuga - 40) * z) / focal, direita = ((W - fuga + 40) * z) / focal;
        // linhas alternadas deslocadas meio passo: a trama fica em quincôncio, sem riscos alinhados
        for (let x = Math.ceil(esquerda / passo) * passo + (j % 2) * passo * 0.5; x < direita; x += passo) pontos.push(x, z, f);
      }
      n = pontos.length / 3;
      gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(pontos), gl!.STATIC_DRAW);
      gl!.uniform2f(uTela, W, H);
      gl!.uniform3f(uCamera, fuga, horizonte, focal);
      gl!.uniform1f(uAltura, ALTURA);
      gl!.uniform1f(uDpr, dpr);
      gl!.uniform1f(uTamanho, retrato ? 3.8 : 4.4);
    }

    // As ondulações: as do ponteiro e as que nascem sozinhas
    const ondulacoes: Ondulacao[] = [];
    const pacote = new Float32Array(MAX_ONDULACOES * 4);
    let tempo = 0, proximaSozinha = 1.2;
    // o ponteiro: para onde ele aponta, onde o "dedo" está (segue com mola) e a força (entra e sai suave)
    let alvo: { x: number; z: number } | null = null;
    const dedo = { x: 0, z: 10, forca: 0 };
    let ultimaSolta: { x: number; z: number } | null = null;
    const noPlano = (sx: number, sy: number) => {
      if (sy <= horizonte + 6) return null;
      const z = (focal * ALTURA) / (sy - horizonte);
      return { x: ((sx - fuga) * z) / focal, z };
    };
    // cheio, a nova fica de fora: descartar uma onda ainda viva faria os pontos darem um pulo
    const ondular = (o: Ondulacao) => { if (ondulacoes.length < MAX_ONDULACOES) ondulacoes.push(o); };
    const aoMover = (e: PointerEvent) => {
      const r = canvas!.getBoundingClientRect();
      alvo = noPlano(e.clientX - r.left, e.clientY - r.top);
      if (!alvo) return;
      // andando, solta uma ondulação a cada tanto de caminho percorrido no mar (parado, não solta nada)
      if (!ultimaSolta || Math.hypot(alvo.x - ultimaSolta.x, alvo.z - ultimaSolta.z) > 2.2) {
        ultimaSolta = alvo;
        ondular({ x: dedo.forca > 0.2 ? dedo.x : alvo.x, z: dedo.forca > 0.2 ? dedo.z : alvo.z, inicio: tempo, forca: 0.4 });
      }
    };
    const aoTocar = (e: PointerEvent) => {
      aoMover(e);
      if (alvo) ondular({ ...alvo, inicio: tempo, forca: 0.9 });
    };
    const aoSair = () => { alvo = null; ultimaSolta = null; };

    let raf = 0, anterior = performance.now(), visivel = true;
    function quadro(agora: number) {
      raf = 0;
      const dt = Math.min(0.05, (agora - anterior) / 1000);
      anterior = agora;
      tempo += dt * RITMO;

      // de tempos em tempos, uma ondulação nasce sozinha num ponto do mar
      if (tempo > proximaSozinha) {
        ondular({ x: (Math.random() - 0.5) * 14, z: 6 + Math.random() * 14, inicio: tempo, forca: 0.75 });
        proximaSozinha = tempo + 3.5 + Math.random() * 3;
      }
      while (ondulacoes.length && tempo - ondulacoes[0].inicio > 7) ondulacoes.shift();
      // o dedo segue o ponteiro com mola e aparece/some devagar
      const k = 1 - Math.exp(-dt * 6);
      if (alvo) {
        if (dedo.forca < 0.01) { dedo.x = alvo.x; dedo.z = alvo.z; } // reaparece onde o ponteiro está, sem deslizar de longe
        dedo.x += (alvo.x - dedo.x) * k;
        dedo.z += (alvo.z - dedo.z) * k;
      }
      dedo.forca += ((alvo ? 1 : 0) - dedo.forca) * (1 - Math.exp(-dt * 4));
      pacote.fill(0);
      ondulacoes.forEach((o, i) => pacote.set([o.x, o.z, tempo - o.inicio, o.forca], i * 4));

      gl!.uniform1f(uTempo, tempo);
      // o feixe de varredura: uma faixa de luz que vem do fundo até perto, em ciclo
      gl!.uniform1f(uVarredura, 30 - ((tempo * 5.5) % 44));
      gl!.uniform3f(uAlvo, dedo.x, dedo.z, dedo.forca);
      gl!.uniform4fv(uOndulacoes, pacote);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.drawArrays(gl!.POINTS, 0, n);
      pedir();
    }
    function pedir() { if (!raf && visivel && !document.hidden && n) raf = requestAnimationFrame(quadro); }
    const aoVisibilidade = () => { anterior = performance.now(); pedir(); };

    montar();
    const tamanho = new ResizeObserver(() => { montar(); pedir(); });
    tamanho.observe(canvas);
    const visao = new IntersectionObserver(([e]) => { visivel = e.isIntersecting; aoVisibilidade(); });
    visao.observe(canvas);
    document.addEventListener('visibilitychange', aoVisibilidade);
    secao.addEventListener('pointermove', aoMover, { passive: true });
    secao.addEventListener('pointerdown', aoTocar, { passive: true });
    secao.addEventListener('pointerleave', aoSair);
    pedir();

    return () => {
      cancelAnimationFrame(raf);
      tamanho.disconnect();
      visao.disconnect();
      document.removeEventListener('visibilitychange', aoVisibilidade);
      secao.removeEventListener('pointermove', aoMover);
      secao.removeEventListener('pointerdown', aoTocar);
      secao.removeEventListener('pointerleave', aoSair);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(programa);
    };
  }, []);

  return <canvas ref={tela} className="mar-de-pontos" aria-hidden="true" />;
}
