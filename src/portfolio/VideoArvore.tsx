'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A Yggdrasil em vídeo, em loop sem emenda (renderizada quadro a quadro da própria experiência).
 * A capa (imagem nítida) aparece na hora; o vídeo certo para a tela é escolhido no navegador e entra
 * por cima quando já pode tocar. Sem vídeo só para quem pede economia de dados.
 * `somenteVisivel`: toca só enquanto está na tela (o cartão do projeto em destaque).
 */
export function VideoArvore({
  capa,
  capaRetrato,
  alt = '',
  somenteVisivel = false,
  className = '',
}: {
  capa: string;
  capaRetrato?: string;
  alt?: string;
  somenteVisivel?: boolean;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(false);

  useEffect(() => {
    const v = video.current;
    // O vídeo é movimento lento e contínuo: toca para todos. Só fica de fora com economia de dados.
    const economia = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (!v || economia) return;
    // O arquivo certo para a tela: em retrato no celular (0,6 MB), largo no computador (2,8 MB)
    const retrato = Boolean(capaRetrato) && matchMedia('(max-width: 767px)').matches;
    const arquivo = retrato ? '/portfolio/arvore-retrato.mp4' : '/portfolio/arvore.mp4';
    // Um pouco mais rápido que o original: na experiência a árvore é quase parada, e o loop precisa parecer vivo
    v.defaultPlaybackRate = v.playbackRate = 1.6;
    if (!somenteVisivel) {
      v.src = arquivo;
      v.play().catch(() => {});
      return;
    }
    // Fora do topo: só baixa quando aparece na tela, e pausa quando sai (economiza dados e bateria)
    const observador = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return v.pause();
        if (!v.src) v.src = arquivo;
        v.play().catch(() => {});
      },
      { rootMargin: '200px 0px', threshold: 0.15 },
    );
    observador.observe(v);
    return () => observador.disconnect();
  }, [capaRetrato, somenteVisivel]);

  return (
    <div className={`video-arvore ${className}`}>
      <picture>
        {capaRetrato && <source media="(max-width: 767px)" srcSet={capaRetrato} />}
        {/* <img> e não next/image: a capa já está no tamanho e na qualidade certos, sem recompressão */}
        <img src={capa} alt={alt} decoding="async" />
      </picture>
      <video
        ref={video}
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        onPlaying={() => setTocando(true)}
        className={tocando ? 'tocando' : ''}
      />
    </div>
  );
}
