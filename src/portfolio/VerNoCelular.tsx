'use client';

import { useEffect, useRef, useState } from 'react';
import { Carrossel } from './Carrossel';
import type { Imagem } from './conteudo';

/** Largura de tela de um celular comum: o app ao vivo é desenhado nela e encolhido para caber no aparelho. */
const LARGURA = 390;

/**
 * O app de verdade dentro do aparelho: um iframe com 390 px de largura (o site vê um celular e mostra a versão
 * dele), encolhido na proporção certa para caber na tela desenhada. Dá para tocar, rolar e navegar.
 */
function AoVivo({ endereco, nome }: { endereco: string; nome: string }) {
  const tela = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0);
  const [carregou, setCarregou] = useState(false);

  useEffect(() => {
    const el = tela.current;
    if (!el) return;
    const medir = () => setEscala(el.clientWidth / LARGURA);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <div ref={tela} className="ao-vivo">
      {!carregou && <p className="abrindo mono">Abrindo o app…</p>}
      {escala > 0 && (
        <iframe
          src={endereco}
          title={`${nome}, ao vivo`}
          onLoad={() => setCarregou(true)}
          style={{ width: LARGURA, height: `${100 / escala}%`, transform: `scale(${escala})`, opacity: carregou ? 1 : 0 }}
        />
      )}
    </div>
  );
}

/**
 * O botão "Ver no celular" na foto da ficha: abre uma janela (o <dialog> nativo, como a prévia do currículo)
 * com um aparelho desenhado em CSS. Dentro dele vai o app ao vivo (`aoVivo`, um endereço) ou, quando o app não
 * pode ser aberto por quem visita, as telas do celular passando no mesmo carrossel das fichas.
 *
 * O conteúdo só é montado com a janela aberta: nada disso pesa no carregamento da página, e fechar desmonta o
 * app (a próxima abertura começa do zero). Esc fecha pelo próprio navegador; clicar no fundo também fecha.
 */
export function VerNoCelular({ telas, aoVivo, nome }: { telas?: Imagem[]; aoVivo?: { endereco: string; nota: string }; nome: string }) {
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
        {aoVivo ? 'Usar no celular' : 'Ver no celular'}
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
            <p className="mono">
              <span className="icone-celular" aria-hidden="true" />
              {nome} · {aoVivo ? <><span className="led" />ao vivo</> : 'no celular'}
            </p>
            <button type="button" className="fechar mono" onClick={fechar} aria-label="Fechar">✕</button>
          </div>
          <div className="aparelho">
            <span className="botao-lateral volume" aria-hidden="true" />
            <span className="botao-lateral energia" aria-hidden="true" />
            <div className="tela">
              {aberta && (aoVivo
                ? <AoVivo endereco={aoVivo.endereco} nome={nome} />
                : telas && <Carrossel imagens={telas} nome={`${nome} no celular`} />)}
            </div>
          </div>
          {aoVivo && (
            <p className="nota-ao-vivo mono">
              {aoVivo.nota} · <a href={aoVivo.endereco} target="_blank" rel="noreferrer">abrir numa aba ↗</a>
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
