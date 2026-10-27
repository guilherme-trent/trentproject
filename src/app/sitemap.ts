import type { MetadataRoute } from 'next';

const SITE = 'https://guilhermetrent.com.br';

/** As páginas que os buscadores devem conhecer: o portfólio e os dois experimentos do laboratório. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE}/experiencia`, changeFrequency: 'yearly', priority: 0.6 },
    { url: `${SITE}/cidade`, changeFrequency: 'yearly', priority: 0.5 },
  ];
}
