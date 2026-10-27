'use client';

import Image from 'next/image';
import { useRef, type CSSProperties } from 'react';
import { PESSOA } from './conteudo';

/**
 * Botão "Ver currículo": abre uma janela sobre a página com as folhas do currículo e o botão de baixar.
 * As folhas são imagens, e não o PDF embutido, porque o navegador do celular (Chrome no Android) não mostra
 * PDF dentro da página: ele só baixa. As imagens nem são pedidas até a janela abrir.
 *
 * Ao trocar o PDF, gere as folhas de novo (150 dpi, WebP):
 *   pdftoppm -r 150 -png public/curriculo-guilherme-trent.pdf /tmp/folha
 *   node -e 'const s=require("sharp");[1,2].forEach(n=>s(`/tmp/folha-${n}.png`).webp({quality:88}).toFile(`public/portfolio/curriculo-${n}.webp`))'
 */
const FOLHAS = [
  { src: '/portfolio/curriculo-1.webp', alt: 'Currículo de Guilherme Trent, página 1: resumo, competências e experiência profissional' },
  { src: '/portfolio/curriculo-2.webp', alt: 'Currículo de Guilherme Trent, página 2: experiência, projetos pessoais e formação' },
];

export function PreviaCurriculo({ className, style, rotulo = 'Ver currículo' }: { className?: string; style?: CSSProperties; rotulo?: string }) {
  const janela = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className={className} style={style} onClick={() => janela.current?.showModal()} aria-haspopup="dialog">
        {rotulo}
      </button>
      {/* Clique fora da folha (no fundo escurecido) fecha; Esc fecha pelo próprio navegador. */}
      <dialog
        ref={janela}
        className="previa-curriculo"
        aria-label="Prévia do currículo"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}>
        <div className="previa-barra">
          <p className="mono">Currículo · {PESSOA.nome}</p>
          <div className="flex gap-2">
            <a href={PESSOA.curriculo} download className="botao chanfro mono">Baixar PDF</a>
            <button type="button" className="botao vazado mono" onClick={() => janela.current?.close()} aria-label="Fechar a prévia">✕</button>
          </div>
        </div>
        <div className="previa-folhas">
          {FOLHAS.map((folha) => (
            <Image key={folha.src} src={folha.src} alt={folha.alt} width={1241} height={1754} quality={90}
              sizes="(max-width: 900px) 100vw, 860px" className="previa-folha" />
          ))}
        </div>
      </dialog>
    </>
  );
}
