import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Animacoes } from './Animacoes';
import {
  COMPETENCIAS, CURIOSIDADE, DESTAQUE, EXPERIENCIA, FERRAMENTAS, FORMACAO, NUMEROS, PESSOA, PROJETOS,
  type Link as LinkDoProjeto, type Projeto,
} from './conteudo';
import { Diagnostico } from './Diagnostico';
import { Faiscas } from './Faiscas';
import { Faixa } from './Faixa';
import { Olho, Telemetria } from './Hud';
import { PreviaCurriculo } from './PreviaCurriculo';
import { Seiva } from './Seiva';
import { VideoArvore } from './VideoArvore';
import { Vitrine } from './Vitrine';
import './portfolio.css';

/**
 * O portfólio: a porta da frente do site. O conteúdo chega pronto do servidor (o Google lê, abre rápido);
 * o movimento vem por cima, em componentes pequenos: as faíscas do fundo, o vídeo da árvore e as entradas
 * em cena ao rolar (Animacoes). A experiência 3D fica em /experiencia.
 */
export function Portfolio() {
  return (
    <div className="portfolio min-h-dvh">
      {/* Antes da primeira pintura: avisa o CSS que há JavaScript, para esconder o que ainda vai entrar em cena */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('com-js')" }} />
      <Faiscas />
      <div className="barra-progresso" aria-hidden="true" />
      <Cabecalho />
      <main className="relative">
        <Topo />
        <Numeros />
        <Faixa itens={FERRAMENTAS} />
        <Destaque />
        <Projetos />
        <Experiencia />
        <Formacao />
        <Faixa itens={COMPETENCIAS} reverso />
        <Contato />
      </main>
      <Rodape />
      <Animacoes />
    </div>
  );
}

const largura = 'mx-auto w-full max-w-6xl px-5 sm:px-8';
const atraso = (ms: number) => ({ '--atraso': `${ms}ms` }) as CSSProperties;

function Cabecalho() {
  return (
    <header className="cabecalho fixed inset-x-0 top-0 z-20">
      <nav className={`${largura} flex h-14 items-center justify-between gap-4`} aria-label="Principal">
        <a href="#topo" className="font-serif text-xl tracking-wide">
          {PESSOA.nome}
        </a>
        <div className="flex items-center gap-5 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-[var(--texto-suave)]">
          <a href="#projetos" className="link-linha hidden sm:inline">Projetos</a>
          <a href="#experiencia" className="link-linha hidden sm:inline">Experiência</a>
          <a href="#contato" className="link-linha hidden sm:inline">Contato</a>
          <Link href="/experiencia" className="link-linha text-[var(--verde-claro)]">
            Experiência 3D →
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Topo() {
  return (
    <section id="topo" className="topo relative flex min-h-dvh items-end overflow-hidden pb-[6vh] pt-[48svh] md:items-center md:pb-0 md:pt-28">
      {/* O chão de grade em perspectiva, correndo na direção de quem olha */}
      <div className="chao" aria-hidden="true"><div className="chao-plano" /></div>
      <div className="topo-arvore" aria-hidden="true">
        <VideoArvore capa="/portfolio/arvore-capa.webp" capaRetrato="/portfolio/arvore-retrato-capa.webp" />
        <Seiva />
        <Olho />
      </div>
      <Telemetria />
      <div className={`${largura} topo-texto relative`}>
        <p className="entra w-fit font-mono text-[0.72rem] uppercase tracking-[0.32em] text-[var(--verde-claro)]" style={atraso(150)} data-decodificar="250">
          {PESSOA.cargo}
        </p>
        <h1 className="mt-4 w-fit font-serif text-[clamp(3.2rem,8vw,6.6rem)] font-light leading-[0.95] tracking-[-0.01em]" aria-label={PESSOA.nome}>
          {[...PESSOA.nome].map((letra, i) => (
            <span key={i} aria-hidden="true" className="letra" style={atraso(380 + i * 45)}>
              {letra === ' ' ? ' ' : letra}
            </span>
          ))}
        </h1>
        <p className="entra mt-6 w-fit max-w-xl text-[clamp(1.05rem,1.6vw,1.25rem)] leading-relaxed text-[var(--texto-suave)]" style={atraso(1050)}>
          {PESSOA.frase}
        </p>
        <div className="mt-9 flex w-fit flex-wrap gap-3">
          <a href="#projetos" className="entra botao botao-principal" style={atraso(1250)}>Ver projetos</a>
          <Link href="/experiencia" className="entra botao" style={atraso(1350)}>Entrar na experiência</Link>
          <PreviaCurriculo className="entra botao" style={atraso(1450)} />
        </div>
        <p className="entra mt-8 w-fit font-mono text-[0.72rem] tracking-[0.14em] text-[var(--texto-fraco)]" style={atraso(1650)}>{PESSOA.local}</p>
      </div>
      <a href="#projetos" className="entra role-para-baixo" style={atraso(2200)} aria-label="Ir para os projetos">
        <span />
      </a>
    </section>
  );
}

function Numeros() {
  return (
    <section aria-label="Números" className="numeros relative overflow-hidden border-y border-[var(--borda)] bg-[rgba(3,6,5,0.6)] backdrop-blur-[2px]">
      {/* O batimento correndo atrás dos números: eco do coração no fim da experiência */}
      <svg className="batimento" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 30 H140 l10 -4 l8 4 h18 l6 10 l10 -34 l9 40 l7 -16 h22 l12 -6 l12 6 H600 H740 l10 -4 l8 4 h18 l6 10 l10 -34 l9 40 l7 -16 h22 l12 -6 l12 6 H1200" />
      </svg>
      <dl className={`${largura} grid grid-cols-2 gap-y-8 py-10 md:grid-cols-4`}>
        {NUMEROS.map((n, i) => (
          <div key={n.rotulo} className="numero pr-4" data-revelar="subir" style={atraso(i * 120)}>
            <dt className="sr-only">{n.rotulo}</dt>
            <dd className="font-serif text-[clamp(2.2rem,4vw,3.2rem)] font-light leading-none text-white" data-revelar="nada" data-contar="">
              {n.valor}
            </dd>
            <dd className="mt-2 max-w-[14rem] text-sm leading-snug text-[var(--texto-suave)]">{n.rotulo}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RotuloSecao({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p className="rotulo-secao" id={id} data-revelar="linha">
      <span>{children}</span>
    </p>
  );
}

function Destaque() {
  const p = DESTAQUE;
  return (
    <section aria-labelledby="destaque" className={`${largura} relative pt-24 md:pt-32`}>
      <RotuloSecao>Projeto em destaque</RotuloSecao>
      <article className="cartao cantos mt-8 grid overflow-hidden md:grid-cols-[1.25fr_1fr]" data-revelar="subir">
        <div className="cartao-imagem relative aspect-[16/10] md:aspect-auto md:border-b-0 md:border-r" data-revelar="cortina">
          <VideoArvore capa="/portfolio/arvore-capa.webp" alt={p.imagem.alt} somenteVisivel className="absolute inset-0" />
        </div>
        <div className="flex flex-col p-6 sm:p-9">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-[var(--verde-claro)]">{p.selo}</p>
          <h2 id="destaque" className="mt-3 font-serif text-[clamp(2rem,3.4vw,2.8rem)] font-light leading-tight">{p.nome}</h2>
          <p className="mt-4 leading-relaxed text-[var(--texto-suave)]">{p.proposta}</p>
          <Beneficios projeto={p} />
          <p className="mt-6 font-mono text-[0.72rem] leading-relaxed tracking-[0.06em] text-[var(--texto-fraco)]">{p.stack}</p>
          <Links links={p.links} principal />
        </div>
      </article>
      <div className="mt-6" data-revelar="subir">
        <Diagnostico />
      </div>
    </section>
  );
}

function Projetos() {
  return (
    <section id="projetos" aria-labelledby="titulo-projetos" className={`${largura} relative scroll-mt-20 pt-24 md:pt-32`}>
      <RotuloSecao id="titulo-projetos">Projetos</RotuloSecao>
      <div className="mt-8" data-revelar="subir">
        <Vitrine projetos={PROJETOS} />
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {PROJETOS.map((p, i) => (
          <article key={p.id} className="cartao flex flex-col overflow-hidden" data-revelar="subir" style={atraso((i % 2) * 140)}>
            <div className="flex flex-1 flex-col p-6 sm:p-7">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--verde-claro)]">{p.selo}</p>
              <h3 className="mt-2 font-serif text-[1.9rem] font-light leading-tight">{p.nome}</h3>
              <p className="mt-3 leading-relaxed text-[var(--texto-suave)]">{p.proposta}</p>
              <Beneficios projeto={p} />
              <p className="mt-auto pt-6 font-mono text-[0.7rem] leading-relaxed tracking-[0.06em] text-[var(--texto-fraco)]">{p.stack}</p>
              <Links links={p.links} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Beneficios({ projeto }: { projeto: Projeto }) {
  return (
    <ul className="beneficios mt-5 space-y-2.5 text-[0.95rem] leading-relaxed">
      {projeto.beneficios.map((b) => (
        <li key={b.titulo} className="flex gap-3">
          <span aria-hidden="true" className="losango mt-[0.6rem] h-[5px] w-[5px] shrink-0 rotate-45 border border-[var(--verde)]" />
          <span>
            <strong className="font-medium text-white">{b.titulo}</strong>
            {b.texto && <span className="text-[var(--texto-suave)]"> {b.texto}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Links({ links, principal = false }: { links: LinkDoProjeto[]; principal?: boolean }) {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      {links.map((l, i) => {
        const classe = `botao ${principal && i === 0 ? 'botao-principal' : ''}`;
        return l.interno ? (
          <Link key={l.href} href={l.href} className={classe}>{l.rotulo}</Link>
        ) : (
          <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className={classe}>
            {l.rotulo} <span aria-hidden="true" className="seta">↗</span>
          </a>
        );
      })}
    </div>
  );
}

function Experiencia() {
  return (
    <section id="experiencia" aria-labelledby="titulo-experiencia" className={`${largura} relative scroll-mt-20 pt-24 md:pt-32`}>
      <RotuloSecao id="titulo-experiencia">Experiência</RotuloSecao>
      <div className="mt-10 grid gap-12 md:grid-cols-[1fr_18rem]">
        <ol className="linha-do-tempo space-y-10 pl-8" data-revelar="nada">
          {EXPERIENCIA.map((e) => (
            <li key={e.cargo + e.quando} className="relative" data-revelar="lado">
              <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-[var(--texto-fraco)]">{e.quando}</p>
              <h3 className="mt-1.5 text-lg font-medium text-white">{e.cargo}</h3>
              <p className="text-[var(--verde-claro)]">{e.onde}</p>
              <p className="mt-2 max-w-2xl leading-relaxed text-[var(--texto-suave)]">{e.texto}</p>
            </li>
          ))}
        </ol>
        <aside className="cartao cantos h-fit p-6" data-revelar="subir" style={atraso(200)}>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--verde-claro)]">Curiosidade</p>
          <p className="mt-3 leading-relaxed text-[var(--texto-suave)]">{CURIOSIDADE}</p>
        </aside>
      </div>
    </section>
  );
}

function Formacao() {
  return (
    <section aria-labelledby="titulo-formacao" className={`${largura} relative pt-24 md:pt-32`}>
      <RotuloSecao id="titulo-formacao">Formação e ferramentas</RotuloSecao>
      <div className="mt-10 grid gap-12 md:grid-cols-2">
        <ul className="space-y-6">
          {FORMACAO.map((f, i) => (
            <li key={f.curso} data-revelar="subir" style={atraso(i * 90)}>
              <p className="text-white">{f.curso}</p>
              <p className="text-sm text-[var(--texto-suave)]">{f.onde} · {f.quando}</p>
            </li>
          ))}
        </ul>
        <ul className="flex h-fit flex-wrap gap-2" aria-label="Ferramentas">
          {FERRAMENTAS.map((f, i) => (
            <li key={f} className="ficha border border-[var(--borda)] px-3 py-1.5 font-mono text-[0.75rem] tracking-[0.04em] text-[var(--texto-suave)]" data-revelar="estalo" style={atraso(i * 45)}>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Contato() {
  return (
    <section id="contato" aria-labelledby="titulo-contato" className={`${largura} relative scroll-mt-20 py-24 md:py-36`}>
      <div className="contato cartao cantos px-6 py-14 text-center sm:px-12" data-revelar="subir">
        <p className="rotulo-secao justify-center before:h-px before:flex-1 before:bg-[linear-gradient(270deg,var(--borda-forte),transparent)] before:content-['']">
          <span>Contato</span>
        </p>
        <h2 id="titulo-contato" className="titulo-contato mt-6 font-serif text-[clamp(2.4rem,5vw,4rem)] font-light italic">Vamos conversar?</h2>
        <a href={`mailto:${PESSOA.email}`} className="email mt-5 inline-block text-lg text-[var(--verde-claro)]">
          {PESSOA.email}
        </a>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <a href={PESSOA.linkedin} target="_blank" rel="noreferrer" className="botao">LinkedIn <span aria-hidden="true" className="seta">↗</span></a>
          <a href={PESSOA.github} target="_blank" rel="noreferrer" className="botao">GitHub <span aria-hidden="true" className="seta">↗</span></a>
          <PreviaCurriculo className="botao" />
          <a href={PESSOA.curriculo} download className="botao botao-principal">Baixar currículo</a>
        </div>
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="relative border-t border-[var(--borda)]">
      <div className={`${largura} flex flex-col gap-2 py-8 font-mono text-[0.7rem] tracking-[0.08em] text-[var(--texto-fraco)] sm:flex-row sm:justify-between`}>
        <p>Feito por {PESSOA.nome}</p>
        <p>
          A <Link href="/experiencia" className="link-linha text-[var(--texto-suave)]">experiência 3D</Link> roda no Regente, o meu motor próprio.
        </p>
      </div>
    </footer>
  );
}
