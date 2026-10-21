'use client';

import { useEffect } from 'react';

/**
 * O movimento do portfólio. A página é HTML pronto do servidor; isto só acorda os efeitos:
 * - [data-revelar]: entra em cena quando aparece na tela (a classe `revelado` dispara o CSS);
 * - [data-contar]: o número conta do zero até o valor;
 * - os textos "criptografados" (o cargo, os botões e os rótulos das seções): se decifram ao entrar em cena,
 *   ao passar o mouse e, de tempos em tempos, um de cada vez, como um sinal vivo;
 * - .cartao: um brilho segue o ponteiro;
 * - a barra de progresso e o cabeçalho reagem à rolagem.
 * Quem pede menos movimento vê as entradas prontas e paradas; os textos cifrados continuam, mais espaçados.
 */
export function Animacoes() {
  useEffect(() => {
    const raiz = document.documentElement;
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const limpar: (() => void)[] = [];

    // Entrar em cena. A "cortina" (imagem recortada) não é observada sozinha: recortada, ela tem área zero e
    // nunca "apareceria" para o observador. Ela abre junto com o cartão que a contém.
    const elementos = [...document.querySelectorAll<HTMLElement>('[data-revelar]:not([data-revelar="cortina"])')];
    const revelar = (el: HTMLElement) => {
      el.classList.add('revelado');
      el.querySelectorAll('[data-revelar="cortina"]').forEach((c) => c.classList.add('revelado'));
    };
    if (calmo) document.querySelectorAll<HTMLElement>('[data-revelar]').forEach((el) => el.classList.add('revelado'));
    else {
      const observador = new IntersectionObserver(
        (entradas) => {
          for (const e of entradas) {
            if (!e.isIntersecting) continue;
            const el = e.target as HTMLElement;
            revelar(el);
            if (el.dataset.contar !== undefined) contar(el);
            observador.unobserve(el);
          }
        },
        { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
      );
      elementos.forEach((el) => observador.observe(el));
      limpar.push(() => observador.disconnect());
    }

    // Os textos criptografados: o cargo e os botões se decifram ao aparecer; depois, de tempos em tempos.
    // Vale para todos: trocar letras no lugar não desloca nada na tela (reduzir, não eliminar). Quem pediu
    // menos movimento recebe o ciclo mais espaçado.
    limpar.push(textosCifrados(calmo));

    // Rolagem: barra de progresso e cabeçalho mais sólido depois do topo
    let quadro = 0;
    const aoRolar = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const max = raiz.scrollHeight - innerHeight;
        raiz.style.setProperty('--progresso', String(max > 0 ? scrollY / max : 0));
        raiz.classList.toggle('rolou', scrollY > 40);
      });
    };
    aoRolar();
    addEventListener('scroll', aoRolar, { passive: true });
    limpar.push(() => removeEventListener('scroll', aoRolar));

    // O brilho que segue o ponteiro nos cartões
    if (!calmo) {
      const aoMover = (e: PointerEvent) => {
        const cartao = (e.target as HTMLElement).closest<HTMLElement>('.cartao');
        if (!cartao) return;
        const r = cartao.getBoundingClientRect();
        cartao.style.setProperty('--px', `${e.clientX - r.left}px`);
        cartao.style.setProperty('--py', `${e.clientY - r.top}px`);
      };
      addEventListener('pointermove', aoMover, { passive: true });
      limpar.push(() => removeEventListener('pointermove', aoMover));
    }

    raiz.classList.add('animacoes-prontas');
    return () => limpar.forEach((f) => f());
  }, []);

  return null;
}

const SIMBOLOS = '01#%&/<>[]{}*+=?$▲◆';
const embaralhar = (texto: string, certas = 0) =>
  [...texto].map((c, i) => (i < certas || c === ' ' ? c : SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)])).join('');

/** Um texto que pode se embaralhar: o nó de texto que muda e o elemento que guarda o rótulo certo (aria-label). */
interface Cifrado { el: HTMLElement; no: Text; final: string }

function cifrado(el: HTMLElement, origem: HTMLElement = el): Cifrado | null {
  const no = [...origem.childNodes].find((n): n is Text => n.nodeType === Node.TEXT_NODE && Boolean(n.textContent?.trim()));
  if (!no) return null;
  const final = no.textContent!;
  // o leitor de tela sempre recebe o texto certo, mesmo no meio do embaralhado
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', final.trim());
  return { el, no, final };
}

/**
 * Os textos "criptografados": viram símbolos e se decifram da esquerda para a direita. Nunca travam nada:
 * os botões funcionam o tempo todo.
 *  - ao entrar em cena: o cargo (com o atraso de [data-decodificar]) e os botões;
 *  - ao passar o mouse num botão;
 *  - contínuo: a cada 6 a 9 s (10 a 14 s com movimento reduzido), UM texto visível na tela (sorteado, nunca o mesmo duas vezes seguidas) se
 *    embaralha e se decifra de novo, como um sinal vivo. Deixa em paz o que está sob o ponteiro ou com o
 *    foco do teclado, e para com a aba em segundo plano.
 */
function textosCifrados(calmo: boolean) {
  const cargos = [...document.querySelectorAll<HTMLElement>('.portfolio [data-decodificar]')].map((el) => cifrado(el));
  const botoes = [...document.querySelectorAll<HTMLElement>('.portfolio .botao')].map((el) => cifrado(el));
  // os rótulos das seções: o rótulo certo fica no <p>, que é o que os títulos das seções referenciam
  const rotulos = [...document.querySelectorAll<HTMLElement>('.portfolio .rotulo-secao')].map((p) => {
    const span = p.querySelector<HTMLElement>('span');
    return span ? cifrado(p, span) : null;
  });
  const todos = [...cargos, ...botoes, ...rotulos].filter((c): c is Cifrado => c !== null);
  const porElemento = new Map(todos.map((c) => [c.el, c]));
  const rodando = new Map<Cifrado, number>();

  const decifrar = (c: Cifrado, duracao: number, espera = 0) => {
    cancelAnimationFrame(rodando.get(c) ?? 0);
    c.no.textContent = embaralhar(c.final); // já nasce embaralhado, mesmo antes de começar a decifrar
    const inicio = performance.now() + espera;
    const passo = (agora: number) => {
      const t = Math.max(0, Math.min(1, (agora - inicio) / duracao));
      c.no.textContent = t < 1 ? embaralhar(c.final, Math.floor(t * c.final.length)) : c.final;
      if (t < 1) rodando.set(c, requestAnimationFrame(passo));
      else rodando.delete(c);
    };
    rodando.set(c, requestAnimationFrame(passo));
  };

  // A entrada em cena (o cargo e os botões; os rótulos já têm a linha que se desenha)
  const entrada = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      const c = porElemento.get(el)!;
      entrada.unobserve(el);
      if (el.dataset.decodificar !== undefined) decifrar(c, 900, Number(el.dataset.decodificar) || 0);
      // os botões do topo entram com atraso: a decifração acompanha a entrada de cada um
      else decifrar(c, 650, (parseFloat(getComputedStyle(el).getPropertyValue('--atraso')) || 0) + 250);
    }
  }, { threshold: 0.6 });
  for (const c of [...cargos, ...botoes]) if (c) entrada.observe(c.el);

  // Ao passar o mouse num botão
  const aoEntrar = (e: Event) => decifrar(porElemento.get(e.currentTarget as HTMLElement)!, 320);
  for (const c of botoes) c?.el.addEventListener('pointerenter', aoEntrar);

  // O contínuo: quem está visível agora
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
          decifrar(ultimo, 750);
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
    for (const c of botoes) c?.el.removeEventListener('pointerenter', aoEntrar);
    rodando.forEach((r) => cancelAnimationFrame(r));
    todos.forEach((c) => { c.no.textContent = c.final; });
  };
}

/** "5 mil+" → conta 0 → 5 e mantém o resto do texto ("mil+"). */
function contar(el: HTMLElement) {
  const texto = el.textContent ?? '';
  const m = texto.match(/^(\d+)(.*)$/);
  if (!m) return;
  const alvo = Number(m[1]);
  const resto = m[2];
  const duracao = 1400;
  const inicio = performance.now();
  const passo = (agora: number) => {
    const t = Math.min(1, (agora - inicio) / duracao);
    const suave = 1 - Math.pow(1 - t, 3);
    el.textContent = `${Math.round(alvo * suave)}${resto}`;
    if (t < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
