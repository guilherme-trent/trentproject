'use client';

import { useRef, useState } from 'react';
import { Carrossel } from './Carrossel';
import type { Imagem } from './conteudo';

/**
 * O botão "Ver no celular" na foto da ficha: abre uma janela (o <dialog> nativo, como a prévia do currículo)
 * com um aparelho desenhado em CSS e as telas do app no celular passando dentro dele, no mesmo carrossel das
 * fichas. Só aparece nos projetos que têm `celular` em conteudo.ts.
 *
 * O carrossel só é montado com a janela aberta: as telas (em 2x) não baixam com a página, só quando alguém pede.
 * Esc fecha pelo próprio navegador; clicar no fundo escurecido também fecha.
 */
export function VerNoCelular({ telas, nome }: { telas: Imagem[]; nome: string }) {
  const janela = useRef<HTMLDialogElement>(null);
  const [aberta, setAberta] = useState(false);

  const fechar = () => janela.current?.close();

  return (
    <>
      <button
        type="button"
        className="ver-celular chanfro mono"
        aria-haspopup="dialog"
        onClick={() => { setAberta(true); janela.current?.showModal(); }}
      >
        <span className="icone-celular" aria-hidden="true" />
        Ver no celular
      </button>
      <dialog
        ref={janela}
        className="janela-celular"
        aria-label={`${nome} no celular`}
        onClose={() => setAberta(false)}
        onClick={(e) => { if (e.target === e.currentTarget) fechar(); }}
      >
        <div className="janela-celular-conteudo">
          <div className="janela-celular-barra">
            <p className="mono"><span className="icone-celular" aria-hidden="true" />{nome} · no celular</p>
            <button type="button" className="fechar mono" onClick={fechar} aria-label="Fechar">✕</button>
          </div>
          <div className="aparelho">
            <span className="botao-lateral volume" aria-hidden="true" />
            <span className="botao-lateral energia" aria-hidden="true" />
            <div className="tela">{aberta && <Carrossel imagens={telas} nome={`${nome} no celular`} />}</div>
          </div>
        </div>
      </dialog>
    </>
  );
}
