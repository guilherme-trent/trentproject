import { Archivo } from 'next/font/google';

/**
 * A fonte do portfólio: Archivo, com o eixo de largura (wdth) para a versão condensada dos títulos.
 * Declarada aqui, e não no layout, para ser baixada só na página principal: a experiência 3D e a cidade
 * não pagam por ela.
 */
export const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  axes: ['wdth'],
});
