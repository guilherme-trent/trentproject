import type { Metadata } from 'next';
import { Cidade } from '@/cidade/Cidade';
import { LABORATORIO } from '@/portfolio/conteudo';

const { cidade } = LABORATORIO;

export const metadata: Metadata = {
  title: cidade.nome,
  description: cidade.proposta,
};

/**
 * A Cidade Neon, um experimento do laboratório do portfólio. A cena é um componente do cliente
 * (canvas); o "como foi feita" chega pronto do servidor, logo abaixo da descida.
 */
export default function PaginaDaCidade() {
  return (
    <div className="portfolio cidade-pagina min-h-dvh">
      <Cidade />
      <section aria-labelledby="bastidores" className="relative z-[3] mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 md:py-32">
        <p className="rotulo-secao" id="bastidores"><span>Como foi feita</span></p>
        <ul className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-2">
          {cidade.bastidores.map((b) => (
            <li key={b.titulo}>
              <h2 className="text-lg font-medium text-white">{b.titulo}</h2>
              <p className="mt-2 leading-relaxed text-[var(--texto-suave)]">{b.texto}</p>
            </li>
          ))}
        </ul>
        <p className="mt-12 font-mono text-[0.72rem] tracking-[0.06em] text-[var(--texto-fraco)]">{cidade.stack}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          {/* <a> e não <Link>: a navegação completa descarta as telas da cidade da memória */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/#laboratorio" className="botao botao-principal">← Voltar ao portfólio</a>
          <a href="https://github.com/guilherme-trent/trentproject/blob/main/src/cidade/motor.ts" target="_blank" rel="noreferrer" className="botao">
            Ver o código <span aria-hidden="true" className="seta">↗</span>
          </a>
        </div>
      </section>
    </div>
  );
}
