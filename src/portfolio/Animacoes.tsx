'use client';

import { useEffect } from 'react';

/**
 * O movimento do portfólio. A página é HTML pronto do servidor; isto só acorda os efeitos:
 * - [data-revelar]: entra em cena quando aparece na tela (a classe `revelado` dispara o CSS);
 * - [data-contar]: o número conta do zero até o valor;
 * - [data-decodificar]: o texto se "decodifica", como no terminal da experiência;
 * - .cartao: um brilho segue o ponteiro;
 * - a barra de progresso e o cabeçalho reagem à rolagem.
 * Quem pede menos movimento vê tudo pronto e parado.
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

    // O cargo que se decodifica (logo de cara)
    for (const el of document.querySelectorAll<HTMLElement>('[data-decodificar]')) {
      if (!calmo) limpar.push(decodificar(el, Number(el.dataset.decodificar) || 0));
    }

    // Os botões nascem criptografados e se decifram sozinhos ao aparecer; ao passar o mouse, de novo
    if (!calmo) limpar.push(cifrarBotoes());

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

/**
 * Os botões "criptografados": o rótulo vira símbolos e se decifra da esquerda para a direita. Nunca trava
 * nada: o botão funciona o tempo todo, e o leitor de tela recebe o texto certo (aria-label).
 */
function cifrarBotoes() {
  const simbolos = '01#%&/<>[]{}*+=?$';
  const botoes = [...document.querySelectorAll<HTMLElement>('.portfolio .botao')];
  const rodando = new Map<HTMLElement, number>();
  const embaralhar = (texto: string) => [...texto].map((c) => (c === ' ' ? c : simbolos[Math.floor(Math.random() * simbolos.length)])).join('');
  const decifrar = (botao: HTMLElement, duracao: number, espera = 0) => {
    const no = [...botao.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    if (!no) return;
    const final = (botao.dataset.rotulo ??= no.textContent!);
    if (!botao.getAttribute('aria-label')) botao.setAttribute('aria-label', final.trim());
    cancelAnimationFrame(rodando.get(botao) ?? 0);
    no.textContent = embaralhar(final); // já nasce embaralhado, mesmo antes de começar a decifrar
    const inicio = performance.now() + espera;
    const passo = (agora: number) => {
      const t = Math.max(0, Math.min(1, (agora - inicio) / duracao));
      const certas = Math.floor(t * final.length);
      no.textContent = [...final].map((c, i) => (i < certas || c === ' ' ? c : simbolos[Math.floor(Math.random() * simbolos.length)])).join('');
      if (t < 1) rodando.set(botao, requestAnimationFrame(passo));
      else no.textContent = final;
    };
    rodando.set(botao, requestAnimationFrame(passo));
  };
  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      // os botões do topo entram em cena com atraso: a decifração acompanha a entrada de cada um
      const atraso = parseFloat(getComputedStyle(e.target).getPropertyValue('--atraso')) || 0;
      decifrar(e.target as HTMLElement, 650, atraso + 250);
      observador.unobserve(e.target);
    }
  }, { threshold: 0.6 });
  const aoEntrar = (e: Event) => decifrar(e.currentTarget as HTMLElement, 320);
  for (const b of botoes) {
    observador.observe(b);
    b.addEventListener('pointerenter', aoEntrar);
  }
  return () => {
    observador.disconnect();
    botoes.forEach((b) => b.removeEventListener('pointerenter', aoEntrar));
    rodando.forEach((r) => cancelAnimationFrame(r));
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

/** Troca as letras por símbolos e vai acertando da esquerda para a direita. */
function decodificar(el: HTMLElement, atraso: number) {
  const final = el.textContent ?? '';
  const simbolos = '▲◆<>/\\[]{}#*+=01';
  const duracao = 900;
  let quadro = 0;
  let inicio = 0;
  const passo = (agora: number) => {
    if (!inicio) inicio = agora;
    const t = (agora - inicio - atraso) / duracao;
    if (t < 0) {
      quadro = requestAnimationFrame(passo);
      return;
    }
    const certas = Math.floor(Math.min(1, t) * final.length);
    el.textContent = [...final]
      .map((c, i) => (i < certas || c === ' ' ? c : simbolos[Math.floor(Math.random() * simbolos.length)]))
      .join('');
    if (t < 1) quadro = requestAnimationFrame(passo);
    else el.textContent = final;
  };
  el.setAttribute('aria-label', final);
  quadro = requestAnimationFrame(passo);
  return () => {
    cancelAnimationFrame(quadro);
    el.textContent = final;
  };
}
