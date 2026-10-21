'use client';

import { useEffect, useRef, useState } from 'react';
import { medirQuadro } from './quadro';

/**
 * A Seiva correndo: pulsos de luz sobem das raízes pelo tronco e seguem pelos galhos até cada fruto,
 * que brilha quando a seiva chega. Os caminhos são desenhados nas coordenadas do quadro do vídeo e a
 * camada é posicionada exatamente sobre o vídeo (mesma conta do object-fit), então seguem a árvore.
 */

// Tronco: das raízes até onde os galhos se abrem
const TRONCO = { larga: 'M 960 1000 C 955 820, 965 680, 960 560 C 958 460, 968 380, 975 330', retrato: 'M 362 940 C 360 800, 368 650, 365 560 C 364 520, 365 495, 365 470' };

// Cada galho parte do alto do tronco. `fruto`: onde o brilho acende quando o pulso chega.
const GALHOS = [
  { larga: 'C 880 230, 720 160, 655 240 Q 630 275, 625 330', retrato: 'C 300 380, 200 330, 170 380 Q 160 400, 160 432', fruto: { larga: [625, 340], retrato: [160, 432] } },
  { larga: 'C 1060 230, 1180 220, 1215 290 Q 1235 330, 1240 405', retrato: 'C 420 380, 500 380, 525 430 Q 532 455, 532 482', fruto: { larga: [1240, 405], retrato: [532, 482] } },
  { larga: 'C 1100 200, 1380 210, 1425 320 Q 1440 360, 1440 435', retrato: 'C 450 360, 640 360, 662 440 Q 668 465, 668 496', fruto: { larga: [1440, 435], retrato: [668, 496] } },
  { larga: 'C 990 220, 1000 120, 1000 30', retrato: 'C 370 350, 375 250, 380 150' },
  { larga: 'C 860 260, 640 180, 520 110', retrato: 'C 260 380, 120 320, 60 280' },
  { larga: 'C 1150 230, 1420 200, 1540 150', retrato: 'C 480 380, 640 330, 700 330' },
] as const;

// A ordem em que a seiva visita os galhos (frutos intercalados com as pontas)
const ORDEM = [0, 3, 1, 4, 2, 5];

export function Seiva() {
  const camada = useRef<HTMLDivElement>(null);
  const [retrato, setRetrato] = useState<boolean | null>(null);

  useEffect(() => {
    const el = camada.current;
    const caixa = el?.parentElement;
    const capa = caixa?.querySelector<HTMLImageElement>('.video-arvore img');
    if (!el || !caixa || !capa) return;
    const posicionar = () => {
      const q = medirQuadro(caixa, capa);
      Object.assign(el.style, { left: `${q.ox}px`, top: `${q.oy}px`, width: `${q.largura * q.escala}px`, height: `${q.altura * q.escala}px` });
      setRetrato(q.retrato);
    };
    posicionar();
    if (!capa.complete) capa.addEventListener('load', posicionar, { once: true });
    const redimensionar = new ResizeObserver(posicionar);
    redimensionar.observe(caixa);
    return () => redimensionar.disconnect();
  }, []);

  const versao = retrato ? 'retrato' : 'larga';
  return (
    <div ref={camada} className="seiva" aria-hidden="true">
      {retrato !== null && (
        <svg viewBox={retrato ? '0 0 720 1280' : '0 0 1920 1080'} preserveAspectRatio="none">
          {ORDEM.map((g, i) => {
            const galho = GALHOS[g];
            const fruto = 'fruto' in galho ? galho.fruto[versao] : null;
            const atraso = { animationDelay: `${i * 1.15}s` };
            return (
              <g key={g}>
                <path d={`${TRONCO[versao]} ${galho[versao]}`} pathLength={100} className="seiva-pulso" style={atraso} />
                {fruto && <circle cx={fruto[0]} cy={fruto[1]} r={retrato ? 34 : 56} className="seiva-brilho" style={atraso} />}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
