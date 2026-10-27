import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Animacoes } from './Animacoes';
import { Carrossel } from './Carrossel';
import {
  CONFIDENCIAL, CURIOSIDADE, DESTAQUE, EXPERIENCIA, FERRAMENTAS, FORMACAO, LABORATORIO, PESSOA, PILARES, PROJETOS,
  type Link as LinkDoProjeto, type Projeto,
} from './conteudo';
import { Coordenadas } from './Coordenadas';
import { FaviconVivo } from './FaviconVivo';
import { archivo } from './fontes';
import { Leds } from './Leds';
import { Barras, Regua } from './Pecas';
import { PreviaCurriculo } from './PreviaCurriculo';
import './portfolio.css';

/**
 * O portfólio: a porta da frente do site. Mesma linguagem da capa do LinkedIn: fundo branco, tinta, verde
 * Loki só nos detalhes, títulos condensados e peças pequenas de "sistema" (ID, código de barras, régua, LEDs,
 * etiqueta). O conteúdo chega pronto do servidor (o Google lê, abre rápido); o movimento vem por cima, no
 * Animacoes. O 3D é o diferencial: mora no Laboratório e num cantinho do topo.
 */
export function Portfolio() {
  return (
    <div className={`inicio ${archivo.variable}`}>
      {/* Antes da primeira pintura: avisa o CSS que há JavaScript, para esconder o que ainda vai entrar em cena */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('com-js')" }} />
      <div className="aba mono" aria-hidden="true"><span>SE // TPM</span></div>
      <div className="miolo">
        <Cabecalho />
        <main>
          <Topo />
          <Pilares />
          <Letreiro />
          <Projetos />
          <Laboratorio />
          <Experiencia />
          <FormacaoEFerramentas />
          <Contato />
        </main>
        <Rodape />
      </div>
      <Animacoes />
      <FaviconVivo />
    </div>
  );
}

const n2 = (i: number) => String(i + 1).padStart(2, '0');
const atraso = (ms: number) => ({ '--atraso': `${ms}ms` }) as CSSProperties;

function Cabecalho() {
  return (
    <header className="cabecalho">
      <nav className="cabecalho-linha" aria-label="Principal">
        <a href="#topo" className="marca mono"><span className="q" /><span data-cifra>GT — 001</span></a>
        <div className="cabecalho-links mono">
          <a href="#projetos" data-cifra>Projetos</a>
          <a href="#laboratorio" data-cifra>Laboratório</a>
          <a href="#experiencia" data-cifra>Experiência</a>
          <a href="#contato" data-cifra>Contato</a>
        </div>
        <span className="estado mono"><span className="led" />Online</span>
      </nav>
    </header>
  );
}

function Topo() {
  return (
    <section id="topo" className="topo listras" aria-labelledby="nome">
      <span className="corte ce" /><span className="corte cd" /><span className="corte be" /><span className="corte bd" />
      <Coordenadas />

      <div className="apresenta">
        <p className="entra id mono" style={atraso(100)}><span className="q" /><span data-cifra="200">Perfil // Brasília, DF · BR</span></p>
        <h1 id="nome" className="condensada entra" style={atraso(220)}>Guilherme<br />Trent</h1>
        <p className="frase entra" style={atraso(380)}>{PESSOA.frase}</p>
        <p className="onde mono entra" style={atraso(480)}>Remoto · híbrido · presencial em Brasília</p>
        <div className="acoes entra" style={atraso(580)}>
          <a className="botao chanfro mono" href="#projetos" data-cifra="700">Ver projetos <span className="seta" aria-hidden="true">→</span></a>
          <PreviaCurriculo className="botao vazado mono" />
          <span className="redes mono">
            <a href={PESSOA.linkedin} target="_blank" rel="noreferrer">LinkedIn ↗</a>
            <a href={PESSOA.github} target="_blank" rel="noreferrer">GitHub ↗</a>
          </span>
        </div>
        <div className="detalhes entra" style={atraso(720)} aria-hidden="true">
          <div><Leds /><p className="rot mono">Sistemas · ativos</p></div>
          <div><Barras barras={30} altura={20} /><p className="rot mono">15°47′S · 47°52′W</p></div>
        </div>
      </div>

      <div className="pendurada entra" style={atraso(300)}>
        <span className="pontilhado" aria-hidden="true" />
        <span className="cordao" aria-hidden="true" />
        <div className="sombra">
          <div className="etiqueta chanfro">
            <div className="canhoto" aria-hidden="true"><span className="furo" /><span className="n mono">Nº 001</span></div>
            <div className="corpo">
              <p className="cab mono"><span data-cifra="500">Perfil // Profissional</span><span className="on"><span className="led" />Online</span></p>
              <p className="cargo condensada">Software Engineer</p>
              <p className="cargo condensada">Technical Product Manager</p>
              <div className="pe mono"><span>Full Stack · Cloud &amp; AI</span><Barras barras={22} altura={16} semente={11} className="claras" /></div>
            </div>
          </div>
        </div>
        <p className="serie mono" aria-hidden="true">Lote 2026 · Série GT-001 · Feito em Brasília</p>
      </div>

      <Regua tracos={60} passo={8} altura={10} className="regua-topo" />

      <Link className="portal mono entra" style={atraso(900)} href="/experiencia" title="Entrar na experiência em 3D">
        <Image className="chanfro" src={DESTAQUE.imagem.src} alt="" width={56} height={56} />
        <span className="t"><b data-cifra="1000">EXP — 01 · A árvore</b>Experiência em 3D</span>
        <span className="seta" aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

function Pilares() {
  return (
    <section className="pilares secao" aria-label="O que eu faço">
      <div className="grade">
        {PILARES.map((p, i) => (
          <div key={p.titulo} data-revelar style={atraso(i * 90)}>
            <span className="n mono">{n2(i)}</span>
            <h2 className="condensada">{p.titulo}</h2>
            <p>{p.texto}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CabecalhoSecao({ numero, titulo, id, lado }: { numero: number; titulo: string; id: string; lado?: string }) {
  return (
    <div className="cabecalho-secao">
      <div>
        <p className="num mono" data-cifra>{`// ${String(numero).padStart(2, '0')} · ${titulo}`}</p>
        <h2 id={id} className="condensada">{titulo}</h2>
      </div>
      {lado && <p className="lado mono">{lado}</p>}
    </div>
  );
}

function Projetos() {
  const emProducao = PROJETOS.filter((p) => p.selo === 'em produção').length;
  // null = a ficha cifrada, no lugar dela na grade
  const fichas: (Projeto | null)[] = [...PROJETOS];
  fichas.splice(CONFIDENCIAL.posicao, 0, null);
  return (
    <section id="projetos" className="projetos secao" aria-labelledby="titulo-projetos">
      <CabecalhoSecao numero={1} titulo="Projetos" id="titulo-projetos" lado={`${fichas.length} fichas · ${emProducao} em produção`} />
      <div className="grade">
        {fichas.map((p, i) => p
          ? <Ficha key={p.id} projeto={p} indice={i} total={fichas.length} />
          : <FichaCifrada key="confidencial" indice={i} total={fichas.length} />)}
      </div>
    </section>
  );
}

/** Símbolos de sistema, sempre os mesmos para a mesma semente (o HTML do servidor e o do navegador batem). */
function cifraFixa(tamanho: number, semente: number) {
  const simbolos = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/<>#*+=';
  let s = semente;
  return Array.from({ length: tamanho }, () => simbolos[(s = (s * 9301 + 49297) % 233280) % simbolos.length]).join('');
}

/** Cifra em "palavras" de 3 a 8 símbolos: a linha tarjada quebra entre palavras, como um texto censurado. */
function cifraEmPalavras(tamanho: number, semente: number) {
  const letras = cifraFixa(tamanho, semente);
  const palavras: string[] = [];
  let s = semente;
  for (let i = 0; i < letras.length; ) {
    const n = 3 + ((s = (s * 9301 + 49297) % 233280) % 6);
    palavras.push(letras.slice(i, i + n));
    i += n;
  }
  // sobra curta no fim (1 ou 2 símbolos) se junta à palavra anterior
  if (palavras.length > 1 && palavras[palavras.length - 1].length < 3) {
    const sobra = palavras.pop()!;
    palavras[palavras.length - 1] += sobra;
  }
  return palavras.join(' ');
}

/**
 * A ficha da Atomtech: o mesmo molde das outras, com tudo o que é do produto trocado por cifra viva
 * ([data-sigilo], que o Animacoes embaralha sem parar). O leitor de tela ouve só "conteúdo confidencial".
 */
function FichaCifrada({ indice, total }: { indice: number; total: number }) {
  const painel = Array.from({ length: 24 }, (_, i) => cifraFixa(96, 101 + i * 7)).join('\n');
  return (
    <article className="ficha ficha-cifrada chanfro" data-revelar style={atraso((indice % 2) * 110)} aria-label="Projeto confidencial">
      <div className="foto" aria-hidden="true">
        <pre className="painel-cifra mono" data-sigilo>{painel}</pre>
        <span className="varredura" />
        <span className="carimbo condensada">Confidencial<small className="mono">NDA · acesso restrito</small></span>
        <span className="selo mono"><span className="cadeado" />{CONFIDENCIAL.selo}</span>
      </div>
      <div className="corpo">
        <p className="id mono"><span>PROJ — {n2(indice)}</span><span>Ficha {n2(indice)} / {String(total).padStart(2, '0')}</span></p>
        <h3 className="condensada" aria-label="Projeto confidencial"><span data-sigilo aria-hidden="true">{cifraFixa(11, 31)}</span></h3>
        <p className="proposta">{CONFIDENCIAL.proposta}</p>
        <ol aria-label="Conteúdo confidencial">
          {CONFIDENCIAL.linhas.map((tamanho, j) => (
            <li key={j} aria-hidden="true"><span className="mono">{n2(j)}</span><span className="tarjas"><span className="tarja mono" data-sigilo>{cifraEmPalavras(tamanho, 57 + j * 13)}</span></span></li>
          ))}
        </ol>
        <div className="pe">
          <p className="stack mono" aria-label="Stack confidencial"><span data-sigilo aria-hidden="true">{cifraFixa(5, 3)} · {cifraFixa(8, 5)} · {cifraFixa(6, 9)}</span></p>
          <span className="restrito mono"><span className="cadeado" />Acesso restrito</span>
        </div>
      </div>
    </article>
  );
}

function Ficha({ projeto: p, indice, total }: { projeto: Projeto; indice: number; total: number }) {
  return (
    <article className="ficha chanfro" data-revelar style={atraso((indice % 2) * 110)}>
      <div className="foto">
        <Carrossel imagens={[p.imagem, ...(p.galeria ?? [])]} nome={p.nome} />
        <span className="selo mono">{p.selo === 'em produção' && <span className="led" />}{p.selo}</span>
      </div>
      <div className="corpo">
        <p className="id mono"><span>PROJ — {n2(indice)}</span><span>Ficha {n2(indice)} / {String(total).padStart(2, '0')}</span></p>
        <h3 className="condensada">{p.nome}</h3>
        <p className="proposta">{p.proposta}</p>
        <ol>
          {p.beneficios.map((b, j) => (
            <li key={b.titulo}><span className="mono">{n2(j)}</span><span><b>{b.titulo}</b> {b.texto}</span></li>
          ))}
        </ol>
        <div className="pe">
          <p className="stack mono">{p.stack}</p>
          <div className="links">{p.links.map((l) => <LinkFicha key={l.href} link={l} />)}</div>
        </div>
      </div>
    </article>
  );
}

function LinkFicha({ link: l }: { link: LinkDoProjeto }) {
  if (l.interno) return <Link href={l.href} className="link mono">{l.rotulo} →</Link>;
  return <a href={l.href} target="_blank" rel="noreferrer" className="link mono">{l.rotulo} ↗</a>;
}

function Laboratorio() {
  const { cidade } = LABORATORIO;
  const experimentos = [
    { id: 'EXP — 01', selo: DESTAQUE.selo, nome: DESTAQUE.nome, texto: DESTAQUE.proposta, href: '/experiencia', imagem: DESTAQUE.imagem, largo: true },
    { id: 'EXP — 02', selo: cidade.selo.replace('experimento · ', ''), nome: cidade.nome, texto: cidade.proposta, href: cidade.href, imagem: { src: '/portfolio/cidade.webp', alt: 'A Cidade Neon, desenhada em canvas 2D' }, largo: false },
  ];
  return (
    <section id="laboratorio" className="lab secao" aria-labelledby="titulo-lab">
      <span className="listras-claras" aria-hidden="true" />
      <div className="lab-topo">
        <span className="corte-verde" aria-hidden="true" />
        <CabecalhoSecao numero={2} titulo="Laboratório" id="titulo-lab" lado="Experimentos que moram no site" />
      </div>
      <div className="grade">
        {experimentos.map((e, i) => (
          <Link key={e.id} href={e.href} className="experimento chanfro" data-revelar style={atraso(i * 110)}>
            <Image src={e.imagem.src} alt={e.imagem.alt} fill sizes={e.largo ? '(min-width: 981px) 55vw, 100vw' : '(min-width: 981px) 42vw, 100vw'} />
            <span className="entrar mono">Entrar →</span>
            <span className="info">
              <span className="mono">{e.id} · {e.selo}</span>
              <span className="nome condensada">{e.nome}</span>
              <span className="texto">{e.texto}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Experiencia() {
  return (
    <section id="experiencia" className="exp secao" aria-labelledby="titulo-exp">
      <CabecalhoSecao numero={3} titulo="Experiência" id="titulo-exp" lado="Desde 2020" />
      <ol>
        {EXPERIENCIA.map((x) => (
          <li key={x.cargo} className={`linha ${x.quando.includes('hoje') ? 'atual' : ''}`} data-revelar>
            <span className="quando mono">{x.quando}{x.quando.includes('hoje') && <span className="ativo"><span className="led" />Ativo</span>}</span>
            <div><h3 className="condensada">{x.cargo}</h3><p className="onde">{x.onde}</p></div>
            <p>{x.texto}</p>
          </li>
        ))}
      </ol>
      <p className="curiosidade chanfro" data-revelar><span className="mono">Curiosidade</span><span>{CURIOSIDADE}</span><Barras barras={26} altura={18} semente={23} className="claras" /></p>
    </section>
  );
}

function FormacaoEFerramentas() {
  return (
    <section className="duas secao escura" aria-label="Formação e ferramentas">
      <span className="listras-claras" aria-hidden="true" />
      <div>
        <CabecalhoSecao numero={4} titulo="Formação" id="titulo-formacao" />
        <ul className="formacao">
          {FORMACAO.map((f) => (
            <li key={f.curso} data-revelar><span><b>{f.curso}</b><span>{f.onde}</span></span><span className="mono">{f.quando}</span></li>
          ))}
        </ul>
      </div>
      <div>
        <CabecalhoSecao numero={5} titulo="Ferramentas" id="titulo-ferramentas" lado={`${FERRAMENTAS.length} itens`} />
        <ul className="chips mono" data-revelar>
          {FERRAMENTAS.map((f) => <li key={f}>{f}</li>)}
        </ul>
        <Regua tracos={50} passo={8} altura={10} className="regua-ferramentas" />
      </div>
    </section>
  );
}

function Contato() {
  return (
    <section id="contato" className="contato secao listras" aria-labelledby="titulo-contato">
      <span className="cordao-contato" aria-hidden="true" />
      <div className="contato-etiqueta chanfro" data-revelar>
        <div className="canhoto" aria-hidden="true"><span className="furo" /><span className="n mono">Nº 006</span></div>
        <div className="corpo">
          <div>
            <p className="num mono" data-cifra>{'// 06 · Contato'}</p>
            <h2 id="titulo-contato" className="condensada">Vamos construir<br />algo juntos?</h2>
            <a className="email" href={`mailto:${PESSOA.email}`}>{PESSOA.email} <span aria-hidden="true">→</span></a>
          </div>
          <div className="links mono">
            <a href={PESSOA.linkedin} target="_blank" rel="noreferrer">LinkedIn ↗</a>
            <a href={PESSOA.github} target="_blank" rel="noreferrer">GitHub ↗</a>
            <a href={PESSOA.curriculo} download>Baixar currículo (PDF) ↓</a>
            <Barras barras={26} altura={18} semente={31} className="claras" />
          </div>
        </div>
      </div>
    </section>
  );
}

/** A faixa preta fina entre os pilares e os projetos: as áreas correndo devagar, como um letreiro de sistema. */
function Letreiro() {
  const itens = ['Engenharia', 'Produto', 'Gestão', 'Full Stack', 'Cloud & AI', 'GovTech & EdTech', 'Brasília, DF', 'Remoto · híbrido · presencial'];
  // Quatro cópias seguidas, e a animação anda exatamente uma (25% do trilho) antes de recomeçar: o recomeço
  // cai no mesmo desenho, então não se vê a emenda. Com quatro, sobram três cópias cobrindo a tela, mesmo larga.
  const trilho = [...itens, ...itens, ...itens, ...itens];
  return (
    <div className="letreiro mono" aria-hidden="true">
      <div className="letreiro-trilho">
        {trilho.map((t, i) => <span key={i}><span className="q" />{t}</span>)}
      </div>
    </div>
  );
}

function Rodape() {
  return (
    <footer className="rodape mono">
      <p>© {new Date().getFullYear()} {PESSOA.nome} · Todos os direitos reservados</p>
      <p>A <Link href="/experiencia">experiência 3D</Link> roda no Regente, o meu motor próprio.</p>
    </footer>
  );
}
