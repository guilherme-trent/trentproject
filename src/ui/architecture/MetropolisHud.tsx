'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { mulberry32 } from '@/engine/lib/random';
import { useAppStore } from '@/engine/store/useAppStore';
import { EQUIPMENT } from '@/engine/store/useProgressStore';
import { ADMIN, BACK_LABEL, CHAOS_MESSAGE, INTERCEPT, TIMING } from '@/scenes/realm-architecture/metropolis/config';
import { useMetropolis } from '@/scenes/realm-architecture/metropolis/store';
import { terminalLayout } from '@/scenes/realm-architecture/metropolis/terminal';
import type { MetropolisDirector, MetropolisStage } from '@/scenes/realm-architecture/metropolis/director';

const returnToTree = () => useAppStore.getState().setScene('hub');

/** O manifesto — o texto aprovado, digitado letra por letra. */
const MANIFESTO =
  'Dominar ferramentas que são capazes de criar o que ainda nem sequer existe e, ao mesmo tempo, trazer experiências únicas e imersivas é uma habilidade de desbravação. É uma habilidade que permite explorar, criar, desenvolver e inovar. Quando você domina essas qualificações, você recebe um título natural que é gravado em seu ser pelo resto da sua vida.';

/**
 * Ritmo de DIGITAÇÃO na velocidade de leitura: ~28 caracteres/s (≈ 280
 * palavras por minuto — quem lê acompanha sem esperar), com a irregularidade
 * de uma mão de verdade (±jitter/2 por tecla, espaço mais ligeiro), respiro
 * nas vírgulas e um fôlego nos pontos.
 */
const TYPING = { char: 1 / 28, jitter: 0.5, space: 0.7, comma: 0.16, period: 0.42 } as const;

/** Instante (s, desde o início da digitação) em que cada caractere aparece — mesma semente, mesmo ritmo. */
function typingSchedule(text: string) {
  const random = mulberry32(0x7e47);
  const times = new Float32Array(text.length);
  let at = 0;
  for (let i = 0; i < text.length; i++) {
    times[i] = at;
    const char = text[i];
    at += TYPING.char * (char === ' ' ? TYPING.space : 1) * (1 + (random() - 0.5) * TYPING.jitter);
    if (char === ',') at += TYPING.comma;
    else if (char === '.') at += TYPING.period;
  }
  return times;
}
const MANIFESTO_TIMES = typingSchedule(MANIFESTO);

/** Etapas sem a moldura do reino: o fake-out precisa parecer real; a forja e a saída são cinema. */
const NO_CHROME = new Set<MetropolisStage>(['glitch', 'intercept', 'shatter', 'forge', 'relic', 'exit']);
const STEERING = new Set<MetropolisStage>(['arrive', 'journey', 'climax']);

const subscribeResize = (notify: () => void) => {
  window.addEventListener('resize', notify);
  return () => window.removeEventListener('resize', notify);
};
const useViewport = () => ({
  width: useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1280),
  height: useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 800),
});
const finePointer = () => window.matchMedia('(pointer: fine)');
const subscribePointer = (notify: () => void) => {
  const query = finePointer();
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const useFinePointer = () => useSyncExternalStore(subscribePointer, () => finePointer().matches, () => true);

/** Lê o diretor a cada frame e escreve direto no DOM (zero re-render por frame). */
function useDirectorLoop(director: MetropolisDirector | null, write: (director: MetropolisDirector) => void) {
  const writer = useRef(write);
  useEffect(() => {
    writer.current = write;
  });
  useEffect(() => {
    if (!director) return;
    let frame = 0;
    const loop = () => {
      writer.current(director);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [director]);
}

const LABEL = 'font-mono text-[10px] uppercase tracking-[0.32em] text-white/45';

/**
 * HUD do fruto 1 — brutalismo editorial: preto profundo, branco puro,
 * filetes finos, a serifa (Cormorant) para a voz e a mono técnica (Geist
 * Mono) para o sistema. A cena decide (diretor → store, só nas trocas de
 * etapa); a HUD só traduz cada etapa.
 */
export function MetropolisHud() {
  const stage = useMetropolis((state) => state.stage);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && returnToTree();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.6 } }} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
      <AnimatePresence>
        {!NO_CHROME.has(stage) && (
          <motion.button
            key="back"
            type="button"
            onClick={returnToTree}
            initial={{ opacity: 0 }}
            animate={{ opacity: stage === 'chaos' ? 0.55 : 1, transition: { delay: stage === 'chaos' ? 4 : 1.2, duration: 1.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="pointer-events-auto absolute left-[max(1.5rem,env(safe-area-inset-left))] top-[max(1.5rem,env(safe-area-inset-top))] border border-white/15 bg-black/60 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.3em] text-white/70 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/60"
          >
            ← Yggdrasil
          </motion.button>
        )}
      </AnimatePresence>

      {STEERING.has(stage) && <JourneyReadout stage={stage} />}
      <AnimatePresence>{(stage === 'climax' || stage === 'glitch') && <TitleWindow key="title" glitching={stage === 'glitch'} />}</AnimatePresence>
      {stage === 'glitch' && <ScreenTear />}
      {(stage === 'intercept' || stage === 'glitch') && <InterceptControls />}
      <AnimatePresence>{stage === 'chaos' && <ChaosHud key="chaos" />}</AnimatePresence>
      <AnimatePresence>
        {stage === 'forge' && (
          <motion.p
            key="forge"
            className={`absolute inset-x-0 top-[max(9%,calc(env(safe-area-inset-top)+3rem))] text-center ${LABEL} !text-emerald-100/90`}
            initial={{ opacity: 0, letterSpacing: '1em' }}
            animate={{ opacity: 1, letterSpacing: '0.42em', transition: { duration: 0.7 } }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
          >
            Ressonância 100% — condensando
          </motion.p>
        )}
      </AnimatePresence>
      <AnimatePresence>{(stage === 'relic' || stage === 'exit') && <RelicWindow key="relic" />}</AnimatePresence>
    </motion.div>
  );
}

// ── Jornada ──────────────────────────────────────────────────────────────────

/**
 * O comando (segurar W / arrastar e segurar) no centro até o primeiro
 * avanço; depois só o trilho de construção com a legenda dos controles,
 * que acende enquanto o acelerador está pressionado.
 */
function JourneyReadout({ stage }: { stage: MetropolisStage }) {
  const director = useMetropolis((state) => state.director);
  const fine = useFinePointer();
  const prompt = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const forward = useRef<HTMLSpanElement>(null);
  const backward = useRef<HTMLSpanElement>(null);
  const shown = useRef(-1);

  useDirectorLoop(director, (d) => {
    const p = d.progress;
    if (prompt.current) prompt.current.style.opacity = String(Math.max(0, 1 - p / 0.05));
    if (fill.current) fill.current.style.transform = `scaleY(${p})`;
    if (rail.current) rail.current.style.opacity = String(Math.min(1, p / 0.03) * (d.stage === 'climax' ? 0 : 1));
    if (forward.current) forward.current.style.opacity = d.throttle > 0.05 ? '1' : '0.3';
    if (backward.current) backward.current.style.opacity = d.throttle < -0.05 ? '1' : '0.3';
    const percent = Math.round(p * 100);
    if (label.current && percent !== shown.current) {
      shown.current = percent;
      label.current.textContent = String(percent).padStart(3, '0');
    }
  });

  return (
    <>
      <motion.div
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: stage === 'climax' ? 0 : 1, transition: { delay: stage === 'arrive' ? 2.0 : 0, duration: 1 } }}
      >
        <div ref={prompt} className="flex flex-col items-center gap-6">
          {fine ? (
            <div className="flex items-end gap-3" aria-hidden>
              <span className="grid h-12 w-12 place-items-center border bg-black/40 font-mono text-[15px] font-medium text-white" style={{ animation: 'key-hold 2.4s ease-in-out infinite' }}>
                W
              </span>
              <span className="grid h-12 w-12 place-items-center border border-white/20 font-mono text-[15px] text-white/50">↑</span>
            </div>
          ) : (
            <HoldIcon />
          )}
          <div>
            <p className="font-serif text-[clamp(22px,3.4vh,30px)] font-light italic text-white/90">
              {fine ? 'Segure W para avançar no tempo' : 'Toque, arraste para cima e segure'}
            </p>
            <p className={`mt-3 ${LABEL}`}>{fine ? 'S ou ↓ para retroceder · solte para parar' : 'arraste para baixo para retroceder'}</p>
          </div>
        </div>
      </motion.div>

      <div ref={rail} className="pointer-events-none absolute right-[max(1.25rem,env(safe-area-inset-right))] top-1/2 flex -translate-y-1/2 flex-col items-center gap-3 opacity-0 transition-opacity duration-500">
        <span ref={forward} className="font-mono text-[10px] text-emerald-200 transition-opacity duration-200">
          {fine ? 'W ▲' : '▲'}
        </span>
        <div className="relative h-[28vh] w-px bg-white/10">
          <div ref={fill} className="absolute inset-0 origin-top scale-y-0 bg-gradient-to-b from-emerald-100 to-emerald-400 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
        </div>
        <span ref={backward} className="font-mono text-[10px] text-emerald-200 transition-opacity duration-200">
          {fine ? 'S ▼' : '▼'}
        </span>
        <span className="font-mono text-[10px] tabular-nums tracking-[0.2em] text-white/70">
          <span ref={label}>000</span>%
        </span>
      </div>
    </>
  );
}

function HoldIcon() {
  return (
    <div className="relative h-20 w-12" aria-hidden>
      <div className="absolute left-1/2 top-1 h-[60px] w-px -translate-x-1/2 bg-gradient-to-t from-transparent via-emerald-200/50 to-emerald-200" />
      <svg
        width="34"
        height="40"
        viewBox="0 0 34 40"
        fill="none"
        className="absolute left-1/2 top-1/2 -ml-[17px] -mt-[8px] drop-shadow-[0_0_8px_rgba(110,231,183,0.6)]"
        style={{ animation: 'drag-hold 2.6s ease-in-out infinite' }}
      >
        <path
          d="M12 18V5.5a2.5 2.5 0 0 1 5 0V16m0-2.5a2.5 2.5 0 0 1 5 0V17m0-2a2.5 2.5 0 0 1 5 0v2.5m0-.5a2.5 2.5 0 0 1 5 0V27c0 6.6-5 11-11 11h-2.5c-4 0-6.3-1.7-8.3-4.6L3 26.5a2.6 2.6 0 0 1 4.1-3.2L12 28"
          stroke="rgba(236,253,245,0.92)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ── A janela que se constrói ─────────────────────────────────────────────────

const HAIRLINE = 'bg-white/80 shadow-[0_0_6px_rgba(167,243,208,0.55)]';

/**
 * A janela não aparece, ela se CONSTRÓI: os filetes se desenham lado a
 * lado, os cantos travam, o vidro acende e só então o conteúdo entra.
 * Inclinada no espaço e flutuando de leve. O vidro é gradiente + reflexo
 * no topo, sem backdrop-filter: desfocar o WebGL animado atrás custava
 * frames a cada frame (medido no caos: p95 de 33 ms).
 */
function ConstructWindow({ children, delay = 0, className = '', label }: { children: ReactNode; delay?: number; className?: string; label: string }) {
  const at = (t: number) => ({ delay: delay + t, duration: 0.34, ease: [0.65, 0, 0.35, 1] as const });
  return (
    <motion.div className={`[perspective:1600px] ${className}`} animate={{ y: [0, -4, 0], transition: { delay: delay + 1.2, duration: 7, repeat: Infinity, ease: 'easeInOut' } }}>
      <div role="dialog" aria-label={label} className="relative [transform:rotateX(5deg)]">
        <motion.div
          className="absolute inset-0 bg-[linear-gradient(170deg,rgba(20,28,26,0.94),rgba(4,7,7,0.95)_42%,rgba(2,4,4,0.97))] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_40px_120px_rgba(0,0,0,0.6)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: delay + 0.9, duration: 0.6 } }}
        />
        <motion.span className={`absolute left-0 top-0 h-px w-full origin-left ${HAIRLINE}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1, transition: at(0) }} />
        <motion.span className={`absolute right-0 top-0 h-full w-px origin-top ${HAIRLINE}`} initial={{ scaleY: 0 }} animate={{ scaleY: 1, transition: at(0.3) }} />
        <motion.span className={`absolute bottom-0 right-0 h-px w-full origin-right ${HAIRLINE}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1, transition: at(0.55) }} />
        <motion.span className={`absolute bottom-0 left-0 h-full w-px origin-bottom ${HAIRLINE}`} initial={{ scaleY: 0 }} animate={{ scaleY: 1, transition: at(0.8) }} />
        {(['left-[-4px] top-[-4px] border-l border-t', 'right-[-4px] top-[-4px] border-r border-t', 'bottom-[-4px] left-[-4px] border-b border-l', 'bottom-[-4px] right-[-4px] border-b border-r'] as const).map((corner, i) => (
          <motion.span
            key={corner}
            className={`absolute h-5 w-5 border-emerald-200 ${corner}`}
            initial={{ opacity: 0, scale: 1.9 }}
            animate={{ opacity: 1, scale: 1, transition: { delay: delay + 1.0 + i * 0.05, duration: 0.25 } }}
          />
        ))}
        <motion.div className="relative" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: delay + 1.05, duration: 0.3 } }}>
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Uma frase do manifesto entrando como bloco: acende e assenta (só opacity/transform — nada de filter sobre o canvas). */
function Phrase({ children, delay, className = '' }: { children: ReactNode; delay: number; className?: string }) {
  return (
    <motion.span
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { delay, duration: 1.1, ease: [0.22, 1, 0.36, 1] } }}
    >
      {children}
    </motion.span>
  );
}

// ── O título ─────────────────────────────────────────────────────────────────

/**
 * A digitação do manifesto, fora do React: um rAF escreve direto no DOM (zero
 * re-render por letra). O trecho ainda não digitado fica no fluxo, invisível —
 * o texto nasce com o tamanho e as quebras de linha finais, nada pula.
 * Devolve `finish` (revela o resto na hora) e `done`, que muda uma única vez.
 */
function useTypewriter(startAt: number) {
  const typed = useRef<HTMLSpanElement>(null);
  const pending = useRef<HTMLSpanElement>(null);
  const finish = useRef(() => {});
  const [done, setDone] = useState(false);

  useLayoutEffect(() => {
    let shown = -1;
    let elapsed = -startAt;
    let last = performance.now();
    let frame = 0;
    const show = (count: number) => {
      if (count === shown) return;
      shown = count;
      typed.current!.textContent = MANIFESTO.slice(0, count);
      pending.current!.textContent = MANIFESTO.slice(count);
    };
    const complete = () => {
      cancelAnimationFrame(frame);
      show(MANIFESTO.length);
      setDone(true);
    };
    const loop = (now: number) => {
      // Passo limitado: aba em segundo plano retoma de onde parou, sem despejar o texto.
      elapsed += Math.min(0.1, (now - last) / 1000);
      last = now;
      let count = shown;
      while (count < MANIFESTO.length && MANIFESTO_TIMES[count] <= elapsed) count++;
      show(count);
      if (count >= MANIFESTO.length) complete();
      else frame = requestAnimationFrame(loop);
    };
    show(0);
    finish.current = complete;
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [startAt]);

  return { typed, pending, finish, done };
}

function TitleWindow({ glitching }: { glitching: boolean }) {
  const director = useMetropolis((state) => state.director);
  const base = 0.6;
  // Quem lê mais rápido toca no texto e ele se revela inteiro.
  const { typed, pending, finish, done } = useTypewriter(base + 1.5);
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-y-auto px-3 py-4 sm:px-4"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.01 } }}
      style={glitching ? { animation: `holo-glitch ${TIMING.glitch * 0.85}s steps(1, end) forwards` } : undefined}
    >
      <ConstructWindow delay={base} label="O título" className="w-[min(760px,100%)]">
        <article className="px-[clamp(18px,4vw,48px)] py-[clamp(18px,3.4vh,40px)]">
          <header className={`flex items-baseline justify-between gap-4 border-b border-white/10 pb-3 ${LABEL}`}>
            <span>
              <span className="text-emerald-200">01</span> — Arquitetura
            </span>
            <span className="hidden sm:inline">Protocolo de despertar</span>
          </header>

          <p
            aria-label={MANIFESTO}
            onClick={() => finish.current()}
            className="pointer-events-auto mt-[clamp(14px,3vh,30px)] font-serif text-[clamp(18px,2.8vh,28px)] font-normal leading-[1.42] text-white/90"
          >
            <span ref={typed} aria-hidden />
            {/* Cursor: span inline vazio (não abre ponto de quebra no meio da palavra); a barra é absoluta. */}
            <span aria-hidden className={`relative transition-opacity duration-700 ${done ? 'opacity-0' : ''}`}>
              <span className="absolute left-[0.03em] top-[0.2em] h-[1.05em] w-[0.06em] bg-emerald-200/90" style={{ animation: 'sys-blink 1.05s steps(1, end) infinite' }} />
            </span>
            <span ref={pending} aria-hidden className="invisible" />
          </p>

          <motion.footer
            className="mt-[clamp(16px,3.4vh,34px)] grid items-end gap-4 border-t border-white/10 pt-[clamp(12px,2.4vh,22px)] sm:grid-cols-[1fr_auto]"
            inert={!done}
            initial={{ opacity: 0, y: 8 }}
            animate={done ? { opacity: 1, y: 0, transition: { delay: 0.35, duration: 0.7 } } : { opacity: 0, y: 8 }}
          >
            <div>
              <p className={LABEL}>Título</p>
              <p className="mt-1 font-sans text-[clamp(22px,3.6vh,36px)] font-medium uppercase leading-none tracking-[-0.02em] text-white">Software Engineer</p>
            </div>
            {glitching ? (
              <p className="border border-emerald-200 bg-emerald-200 px-5 py-4 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-black">Título vestido</p>
            ) : (
              <button
                type="button"
                onClick={() => director?.awaken()}
                className="group pointer-events-auto relative overflow-hidden border border-white bg-white px-5 py-4 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-black transition-colors duration-200 hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-200 sm:text-[12px]"
              >
                <span className="absolute inset-0 origin-left scale-x-0 bg-emerald-300 transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100" />
                <span className="relative">[ Desperte, Software Engineer ]</span>
              </button>
            )}
          </motion.footer>
        </article>
      </ConstructWindow>
    </motion.div>
  );
}

/** O sinal invadido: faixas de rasgo varrendo a tela por um instante (só transform/opacity; sem blend modes sobre o canvas). */
function ScreenTear() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ animation: `screen-tear ${TIMING.glitch}s steps(1, end) forwards` }}>
      <div className="absolute inset-x-0 top-[18%] h-[7%] bg-red-500/25" />
      <div className="absolute inset-x-0 top-[47%] h-[3%] bg-cyan-300/25" />
      <div className="absolute inset-x-0 top-[71%] h-[11%] bg-white/10" />
    </div>
  );
}

/**
 * O terminal é WebGL (precisa estar no frame que estilhaça); aqui só o que
 * o DOM precisa: o botão REAL, invisível, exatamente sobre o botão
 * desenhado (mesmo layout), e uma região viva para leitores de tela.
 */
function InterceptControls() {
  const director = useMetropolis((state) => state.director);
  const lines = useMetropolis((state) => state.lines);
  const ready = useMetropolis((state) => state.ready);
  const { width, height } = useViewport();
  const layout = terminalLayout(width, height);
  const left = layout.x + layout.button.x;
  const top = layout.y + layout.button.y;

  return (
    <>
      <div className="sr-only" aria-live="assertive">
        {lines > 0 && ADMIN} {INTERCEPT.slice(0, lines).map((line) => line.text).join(' ')}
      </div>
      {ready && (
        <button
          type="button"
          autoFocus
          aria-label={BACK_LABEL}
          onClick={() => director?.goBack({ x: (left + layout.button.w / 2) / width, y: 1 - (top + layout.button.h / 2) / height })}
          className="pointer-events-auto absolute cursor-pointer opacity-0"
          style={{ left, top, width: layout.button.w, height: layout.button.h }}
        />
      )}
    </>
  );
}

// ── A Forja ──────────────────────────────────────────────────────────────────

/** A mensagem do sistema piscando, a dica e a Ressonância (lida do diretor por frame). */
function ChaosHud() {
  const director = useMetropolis((state) => state.director);
  const fine = useFinePointer();
  const fill = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const shown = useRef(-1);

  useDirectorLoop(director, (d) => {
    if (fill.current) fill.current.style.transform = `scaleY(${d.resonance})`;
    // O medidor acende enquanto há orquestração e esfria quando o caos volta.
    if (meter.current) meter.current.style.opacity = String(0.5 + 0.5 * d.orchestrating);
    const percent = Math.floor(d.resonance * 100);
    if (label.current && percent !== shown.current) {
      shown.current = percent;
      label.current.textContent = String(percent).padStart(3, '0');
    }
  });

  return (
    <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.6, duration: 0.8 } }} exit={{ opacity: 0, transition: { duration: 0.5 } }}>
      <div className="absolute inset-x-0 top-[max(7%,calc(env(safe-area-inset-top)+4.25rem))] flex justify-center px-4">
        <ConstructWindow delay={0.6} label="Mensagem do sistema" className="w-[min(560px,100%)]">
          <div className="px-5 py-4 text-center">
            <p className={LABEL}>Sistema</p>
            <p className="mt-2 font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-white sm:text-[13px] sm:tracking-[0.3em]" style={{ animation: 'sys-blink 1.1s steps(1, end) infinite' }}>
              {CHAOS_MESSAGE}
            </p>
          </div>
        </ConstructWindow>
      </div>
      <motion.p
        className={`absolute inset-x-0 bottom-[max(7%,env(safe-area-inset-bottom))] px-6 text-center ${LABEL}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 2.4, duration: 1 } }}
      >
        {fine ? 'Conduza com o cursor — o fluxo obedece' : 'Conduza com o dedo — o fluxo obedece'}
      </motion.p>

      <div ref={meter} className="pointer-events-none absolute right-[max(1.25rem,env(safe-area-inset-right))] top-1/2 flex -translate-y-1/2 flex-col items-end gap-3 transition-opacity duration-300">
        <span className={LABEL}>Ressonância</span>
        <div className="relative mr-1 h-[30vh] w-px self-end bg-white/15">
          <div ref={fill} className="absolute inset-0 origin-bottom scale-y-0 bg-gradient-to-t from-emerald-400 to-white shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
        </div>
        <span className="font-sans text-[clamp(28px,4.6vh,44px)] font-extralight tabular-nums leading-none tracking-[-0.04em] text-white">
          <span ref={label}>000</span>
          <span className="ml-0.5 text-[0.45em] text-white/50">%</span>
        </span>
      </div>
    </motion.div>
  );
}

function RelicWindow() {
  const shown = EQUIPMENT.seiva_pura;
  return (
    <motion.div className="absolute inset-x-0 bottom-[max(5%,env(safe-area-inset-bottom))] flex justify-center px-4" exit={{ opacity: 0, transition: { duration: 0.6 } }}>
      <ConstructWindow delay={0.1} label={`Item adquirido: ${shown.name}`} className="w-[min(520px,100%)]">
        <div className="px-6 py-5 text-center">
          <p className={LABEL}>Item adquirido</p>
          <Phrase delay={1.3} className="mt-2 block font-serif text-[clamp(34px,6vh,56px)] font-light italic leading-none text-white [text-shadow:0_0_30px_rgba(110,231,183,0.55)]">
            {shown.name}
          </Phrase>
          <Phrase delay={2.0} className="mx-auto mt-3 block max-w-[38ch] font-sans text-[12px] leading-relaxed text-white/60 sm:text-[13px]">
            {shown.description}
          </Phrase>
        </div>
      </ConstructWindow>
    </motion.div>
  );
}
