'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A Yggdrasil em vídeo, em loop sem emenda (renderizada quadro a quadro da própria experiência).
 * A capa (imagem nítida) aparece na hora; o vídeo entra por cima quando já pode tocar. Sem vídeo só para quem pede economia de dados.
 * `somenteVisivel`: toca só enquanto está na tela (o cartão do projeto em destaque).
 */
export function VideoArvore({
  capa,
  alt = '',
  somenteVisivel = false,
  className = '',
}: {
  capa: string;
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
    const arquivo = '/portfolio/arvore.mp4';
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
  }, [somenteVisivel]);

  return (
    <div className={`video-arvore ${className}`}>
      {/* <img> e não next/image: a capa já está no tamanho e na qualidade certos, sem recompressão */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={capa} alt={alt} decoding="async" />
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
