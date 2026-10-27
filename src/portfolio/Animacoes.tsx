'use client';

import { useEffect } from 'react';

/**
 * O movimento do portfólio. A página é HTML pronto do servidor; isto só acorda os efeitos:
 * - [data-revelar]: entra em cena quando aparece na tela (a classe `revelado` dispara o CSS);
 * - [data-cifra]: os rótulos de sistema se embaralham e se decifram ao aparecer, ao passar o mouse e,
 *   de tempos em tempos, um de cada vez, como um sinal vivo;
 * - [data-sigilo]: a ficha confidencial, cifra que se embaralha sem parar e nunca se decifra;
 * - o cabeçalho fica mais sólido depois do topo (classe `rolou`).
 * Quem pede menos movimento vê as entradas prontas e paradas; os textos cifrados continuam, mais espaçados
 * (trocar letras no lugar não desloca nada na tela: reduzir, não eliminar).
 */
export function Animacoes() {
  useEffect(() => {
    const raiz = document.documentElement;
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const limpar: (() => void)[] = [];

    const elementos = [...document.querySelectorAll<HTMLElement>('.inicio [data-revelar]')];
    if (calmo) elementos.forEach((el) => el.classList.add('revelado'));
    else {
      const observador = new IntersectionObserver(
        (entradas) => {
          for (const e of entradas) {
            if (!e.isIntersecting) continue;
            e.target.classList.add('revelado');
            observador.unobserve(e.target);
          }
        },
        { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
      );
      elementos.forEach((el) => observador.observe(el));
      limpar.push(() => observador.disconnect());
    }

    limpar.push(textosCifrados(calmo));
    limpar.push(sigilo(calmo));

    let quadro = 0;
    const aoRolar = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => raiz.classList.toggle('rolou', scrollY > 24));
    };
    aoRolar();
    addEventListener('scroll', aoRolar, { passive: true });
    limpar.push(() => removeEventListener('scroll', aoRolar));

    return () => limpar.forEach((f) => f());
  }, []);

  return null;
}

const SIMBOLOS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/<>#*+=';
const embaralhar = (texto: string, certas = 0) =>
  [...texto].map((c, i) => (i < certas || c === ' ' ? c : SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)])).join('');

/**
 * A ficha cifrada: o texto de [data-sigilo] já é cifra (não há texto certo por trás). A cada batida, 90 ms
 * (400 ms com movimento reduzido), cerca de 1 símbolo em 8 troca; espaços, pontos e quebras de linha ficam.
 * Só mexe no que está na tela e com a aba à vista.
 */
function sigilo(calmo: boolean) {
  const alvos = [...document.querySelectorAll<HTMLElement>('.inicio [data-sigilo]')].map((el) => ({ el, letras: [...(el.textContent ?? '')] }));
  const visiveis = new Set<Element>();
  const vista = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (e.isIntersecting) visiveis.add(e.target);
      else visiveis.delete(e.target);
    }
  });
  alvos.forEach((a) => vista.observe(a.el));
  const relogio = window.setInterval(() => {
    if (document.hidden) return;
    for (const a of alvos) {
      if (!visiveis.has(a.el)) continue;
      a.letras = a.letras.map((c) => (SIMBOLOS.includes(c) && Math.random() < 0.12 ? SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)] : c));
      a.el.textContent = a.letras.join('');
    }
  }, calmo ? 400 : 90);
  return () => {
    clearInterval(relogio);
    vista.disconnect();
  };
}

/** Um texto que pode se embaralhar: o nó de texto que muda e o texto certo. */
interface Cifrado { el: HTMLElement; no: Text; final: string }

function cifrado(el: HTMLElement): Cifrado | null {
  const no = [...el.childNodes].find((n): n is Text => n.nodeType === Node.TEXT_NODE && Boolean(n.textContent?.trim()));
  if (!no) return null;
  const final = no.textContent!;
  // o leitor de tela sempre recebe o texto certo, mesmo no meio do embaralhado
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', final.trim());
  return { el, no, final };
}

/**
 * Os textos "criptografados": viram símbolos e se decifram da esquerda para a direita. Nunca travam nada.
 *  - ao entrar em cena (com o atraso opcional de data-cifra, em ms);
 *  - ao passar o mouse;
 *  - contínuo: a cada 6 a 9 s (10 a 14 s com movimento reduzido), UM texto visível (nunca o mesmo duas
 *    vezes seguidas) se embaralha de novo. Deixa em paz o que está sob o ponteiro ou com o foco, e para com
 *    a aba em segundo plano.
 */
function textosCifrados(calmo: boolean) {
  const todos = [...document.querySelectorAll<HTMLElement>('.inicio [data-cifra]')].map(cifrado).filter((c): c is Cifrado => c !== null);
  const porElemento = new Map(todos.map((c) => [c.el, c]));
  const rodando = new Map<Cifrado, number>();

  const decifrar = (c: Cifrado, duracao: number, espera = 0) => {
    cancelAnimationFrame(rodando.get(c) ?? 0);
    c.no.textContent = embaralhar(c.final);
    const inicio = performance.now() + espera;
    const passo = (agora: number) => {
      const t = Math.max(0, Math.min(1, (agora - inicio) / duracao));
      c.no.textContent = t < 1 ? embaralhar(c.final, Math.floor(t * c.final.length)) : c.final;
      if (t < 1) rodando.set(c, requestAnimationFrame(passo));
      else rodando.delete(c);
    };
    rodando.set(c, requestAnimationFrame(passo));
  };

  const entrada = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      entrada.unobserve(el);
      decifrar(porElemento.get(el)!, 700, Number(el.dataset.cifra) || 0);
    }
  }, { threshold: 0.6 });
  todos.forEach((c) => entrada.observe(c.el));

  const aoEntrar = (e: Event) => decifrar(porElemento.get(e.currentTarget as HTMLElement)!, 420);
  todos.forEach((c) => c.el.addEventListener('pointerenter', aoEntrar));

  const visiveis = new Set<Cifrado>();
  const vista = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      const c = porElemento.get(e.target as HTMLElement)!;
      if (e.isIntersecting) visiveis.add(c);
      else visiveis.delete(c);
    }
  }, { threshold: 1 });
  todos.forEach((c) => vista.observe(c.el));
  let ultimo: Cifrado | null = null;
  let relogio = 0;
  const agendar = () => {
    relogio = window.setTimeout(() => {
      if (!document.hidden) {
        const ocupado = (c: Cifrado) => rodando.has(c) || c.el.matches(':hover') || c.el.contains(document.activeElement);
        const opcoes = [...visiveis].filter((c) => c !== ultimo && !ocupado(c));
        if (opcoes.length) {
          ultimo = opcoes[Math.floor(Math.random() * opcoes.length)];
          decifrar(ultimo, 900);
        }
      }
      agendar();
    }, calmo ? 10000 + Math.random() * 4000 : 6000 + Math.random() * 3000);
  };
  agendar();

  return () => {
    entrada.disconnect();
    vista.disconnect();
    clearTimeout(relogio);
    todos.forEach((c) => c.el.removeEventListener('pointerenter', aoEntrar));
    rodando.forEach((r) => cancelAnimationFrame(r));
    todos.forEach((c) => { c.no.textContent = c.final; });
  };
}
