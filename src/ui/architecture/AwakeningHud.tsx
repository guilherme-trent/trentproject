'use client';

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Vector2 } from 'three';
import { useAppStore } from '@/engine/store/useAppStore';
import { INTERCEPT, TIMING } from '@/scenes/realm-architecture/awakening/config';
import { useAwakening } from '@/scenes/realm-architecture/awakening/store';
import { BACK_LABEL, SPEAKER, terminalLayout } from '@/scenes/realm-architecture/awakening/terminal';
import type { AwakeningStage } from '@/scenes/realm-architecture/awakening/director';

const returnToTree = () => useAppStore.getState().setScene('hub');

const setCursor = (cursor: string) => {
  document.body.style.cursor = cursor;
};

export const MANIFESTO =
  'Dominar ferramentas que são capazes de criar o que ainda nem sequer existe e, ao mesmo tempo, trazer experiências únicas e imersivas é uma habilidade de desbravação. É uma habilidade que permite explorar, criar, desenvolver e inovar. Quando você domina essas qualificações, você recebe um título natural que é gravado em seu ser pelo resto da sua vida. É o mesmo nome, mas ele não está mais em um papel, ele está em você.';

/** Etapas em que a moldura do reino (voltar) some: o fake-out precisa parecer real. */
const NO_CHROME = new Set<AwakeningStage>(['glitch', 'intercept', 'shatter', 'void']);
const HOLOGRAM = new Set<AwakeningStage>(['hologram', 'awaken', 'glitch']);

const finePointerQuery = () => window.matchMedia('(pointer: fine)');
const subscribeFinePointer = (notify: () => void) => {
  const query = finePointerQuery();
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const useFinePointer = () =>
  useSyncExternalStore(subscribeFinePointer, () => finePointerQuery().matches, () => true);

const subscribeResize = (notify: () => void) => {
  window.addEventListener('resize', notify);
  return () => window.removeEventListener('resize', notify);
};
const useViewport = () => {
  const width = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1280);
  const height = useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 800);
  return { width, height };
};

/**
 * HUD do Despertar. A cena decide (diretor → store, só nas trocas de etapa);
 * a HUD só traduz cada etapa em texto, holograma e botões.
 */
export function AwakeningHud() {
  const stage = useAwakening((state) => state.stage);
  const fine = useFinePointer();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && returnToTree();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const chrome = !NO_CHROME.has(stage);

  return (
    <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.6 } }} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
      <AnimatePresence>
        {(chrome || stage === 'void') && (
          <motion.button
            key="back"
            type="button"
            onClick={returnToTree}
            initial={{ opacity: 0 }}
            // No vazio, a saída volta devagar e discreta (no celular não há Esc).
            animate={{ opacity: stage === 'void' ? 0.5 : 1, transition: { delay: stage === 'void' ? 6 : 1.2, duration: 1.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="pointer-events-auto absolute left-[max(1.5rem,env(safe-area-inset-left))] top-[max(1.5rem,env(safe-area-inset-top))] border border-white/20 bg-[#05080a] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.3em] text-white/70 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/60"
          >
            ← Yggdrasil
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {stage === 'anchor' && (
          <Instruction key="anchor" position="top" eyebrow="Ancoragem" voice="A forma ainda não tem onde se firmar.">
            {fine ? 'Arraste cada fio de gosma até um prego' : 'Arraste cada fio com o dedo até um prego'}
          </Instruction>
        )}
        {stage === 'tear' && (
          <Instruction key="tear" position="center" voice="A forma implora para nascer. Liberte-a.">
            {fine ? 'Seu cursor agora é uma lâmina de luz — corte' : 'Deslize o dedo para cortar a membrana'}
          </Instruction>
        )}
        {stage === 'hunt' && (
          <Instruction key="hunt" position="bottom" eyebrow="Autômato" voice="Ele guarda algo que é seu.">
            Toque o botão de vidro nas costas dele — devagar
          </Instruction>
        )}
      </AnimatePresence>

      {stage === 'tear' && fine && <LightBlade />}
      {HOLOGRAM.has(stage) && <Hologram stage={stage} />}
      {stage === 'awaken' && (
        <motion.div className="absolute inset-0 bg-white" initial={{ opacity: 0.92 }} animate={{ opacity: 0, transition: { duration: TIMING.awakenFlash + 0.4, ease: 'easeOut' } }} />
      )}
      {(stage === 'intercept' || stage === 'glitch') && <InterceptControls />}
      {stage === 'void' && (
        <motion.p
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-serif text-[clamp(30px,6.5vw,60px)] font-light italic tracking-wide text-white/85"
          initial={{ opacity: 0, filter: 'blur(10px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)', transition: { delay: 0.9, duration: 2.2, ease: [0.22, 1, 0.36, 1] } }}
        >
          Brincadeira.
        </motion.p>
      )}
    </motion.div>
  );
}

function Instruction({ position, eyebrow, voice, children }: { position: 'top' | 'center' | 'bottom'; eyebrow?: string; voice: string; children: ReactNode }) {
  const place =
    position === 'top'
      ? 'top-[max(13%,calc(env(safe-area-inset-top)+4.5rem))]'
      : position === 'center'
        ? 'top-[42%] -translate-y-1/2'
        : 'bottom-[max(7%,env(safe-area-inset-bottom))]';
  return (
    <motion.div
      className={`absolute inset-x-0 px-6 text-center ${place}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { delay: 0.5, duration: 1 } }}
      exit={{ opacity: 0, y: -8, filter: 'blur(6px)', transition: { duration: 0.5 } }}
    >
      {eyebrow && <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.5em] text-emerald-300/60">{eyebrow}</p>}
      <p className="font-serif text-[clamp(20px,4.6vh,38px)] font-light italic leading-tight text-white/90 [text-shadow:0_0_28px_rgba(16,185,129,0.35)]">
        {voice}
      </p>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.35em] text-white/50 sm:text-[11px]">{children}</p>
    </motion.div>
  );
}

/**
 * O cursor-lâmina: um traço de luz que segue o ponteiro e se alinha à
 * direção do movimento. Transform direto no elemento (sem estado React).
 * O corte em si é da membrana (WebGL); isto é só a mão que segura a lâmina.
 */
function LightBlade() {
  const blade = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setCursor('none');
    let lastX = 0;
    let lastY = 0;
    let angle = -45;
    const move = (event: PointerEvent) => {
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (dx * dx + dy * dy > 9) angle += ((((Math.atan2(dy, dx) * 180) / Math.PI - angle + 540) % 360) - 180) * 0.35;
      lastX = event.clientX;
      lastY = event.clientY;
      if (blade.current) blade.current.style.transform = `translate(${event.clientX}px, ${event.clientY}px) rotate(${angle}deg)`;
    };
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointermove', move);
      setCursor('');
    };
  }, []);
  return (
    <div ref={blade} className="pointer-events-none absolute left-0 top-0 will-change-transform" style={{ transform: 'translate(-100px, -100px)' }}>
      <div className="h-[3px] w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-emerald-200 to-white shadow-[0_0_14px_3px_rgba(110,231,183,0.75)]" />
    </div>
  );
}

/**
 * O holograma brutalista projetado pelo autômato: concreto de luz — bordas
 * duras, grade crua, tipografia pesada, varredura gravada. Mede a própria
 * base e a entrega ao diretor (o cone de projeção WebGL mira nela).
 */
function Hologram({ stage }: { stage: AwakeningStage }) {
  const director = useAwakening((state) => state.director);
  const panel = useRef<HTMLDivElement>(null);
  const awakened = stage !== 'hologram';

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element || !director) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      director.setHologram(1 - rect.bottom / window.innerHeight, rect.width / 2 / window.innerWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [director]);

  return (
    <div className="absolute inset-x-0 top-[max(5%,calc(env(safe-area-inset-top)+3.75rem))] flex justify-center px-4">
      <motion.div
        ref={panel}
        role="dialog"
        aria-label="Holograma: Guilherme Trent"
        className="relative w-[min(560px,100%)] origin-bottom"
        initial={{ scaleY: 0.02, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1, transition: { delay: 0.35, duration: 0.7, ease: [0.16, 1, 0.3, 1] } }}
        style={stage === 'glitch' ? { animation: `holo-glitch ${TIMING.glitch}s steps(1, end) forwards` } : undefined}
      >
        <div
          className="holo-scanlines relative border border-emerald-300/50 bg-[rgba(2,12,8,0.78)] p-[clamp(16px,3.2vh,28px)] text-emerald-100 shadow-[0_0_40px_rgba(16,185,129,0.18),inset_0_0_30px_rgba(16,185,129,0.08)]"
          style={{ animation: 'holo-flicker 3.2s infinite' }}
        >
          {/* Cantos de concreto: reforços sólidos, nada de arredondado. */}
          <span className="absolute -left-px -top-px h-2 w-6 bg-emerald-300" />
          <span className="absolute -right-px -top-px h-2 w-6 bg-emerald-300" />
          <span className="absolute -bottom-px -left-px h-2 w-6 bg-emerald-300" />
          <span className="absolute -bottom-px -right-px h-2 w-6 bg-emerald-300" />

          <div className="flex items-center justify-between border-b border-emerald-300/30 pb-2 font-mono text-[9px] uppercase tracking-[0.35em] text-emerald-300/70 sm:text-[10px]">
            <span>◢ Projeção · Autômato 01</span>
            <span>Reg. 001</span>
          </div>

          <h2
            className="mt-[clamp(10px,2.4vh,20px)] font-sans text-[clamp(26px,min(7.2vh,10.5vw),58px)] font-black uppercase leading-[0.9] tracking-[-0.02em] text-emerald-50 [text-shadow:0_0_18px_rgba(110,231,183,0.7),0_0_2px_#fff]"
            style={awakened ? undefined : { animation: 'holo-blink 1.1s steps(1, end) infinite' }}
          >
            Guilherme Trent
          </h2>

          <div className="mt-[clamp(10px,2.2vh,18px)] grid grid-cols-[3px_1fr] gap-4">
            <span className="bg-emerald-300/60" />
            <p className="font-sans text-[clamp(12px,1.95vh,15px)] leading-[1.6] text-emerald-50/85">{MANIFESTO}</p>
          </div>

          {awakened ? (
            <p className="mt-[clamp(12px,2.6vh,22px)] border border-emerald-200 bg-emerald-300 px-4 py-3 text-center font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-black">
              ▲ Título gravado · Software Engineer
            </p>
          ) : (
            <button
              type="button"
              autoFocus
              onClick={() => director?.awaken()}
              className="pointer-events-auto mt-[clamp(12px,2.6vh,22px)] block w-full border border-emerald-300 bg-transparent px-3 py-3 font-mono text-[11px] uppercase tracking-[0.16em] sm:tracking-[0.3em] text-emerald-100 transition-colors duration-150 hover:bg-emerald-300 hover:text-black focus-visible:bg-emerald-300 focus-visible:text-black focus-visible:outline-none sm:text-[12px]"
            >
              [ Desperte, Software Engineer ]
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/**
 * O terminal interceptado é WebGL (precisa estar no frame que estilhaça);
 * aqui só o que o DOM precisa: o botão REAL, invisível, exatamente sobre o
 * botão desenhado (mesmo layout), e uma região viva para leitores de tela.
 */
function InterceptControls() {
  const director = useAwakening((state) => state.director);
  const lines = useAwakening((state) => state.lines);
  const ready = useAwakening((state) => state.ready);
  const { width, height } = useViewport();
  const layout = terminalLayout(width, height);
  const left = layout.x + layout.button.x;
  const top = layout.y + layout.button.y;

  return (
    <>
      <div className="sr-only" aria-live="assertive">
        {SPEAKER} {INTERCEPT.slice(0, lines).map((line) => line.text).join(' ')}
      </div>
      {ready && (
        <button
          type="button"
          autoFocus
          aria-label={BACK_LABEL}
          onClick={() => director?.goBack(new Vector2((left + layout.button.w / 2) / width, 1 - (top + layout.button.h / 2) / height))}
          className="pointer-events-auto absolute cursor-pointer opacity-0"
          style={{ left, top, width: layout.button.w, height: layout.button.h }}
        />
      )}
    </>
  );
}
