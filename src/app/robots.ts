import type { MetadataRoute } from 'next';

const SITE = 'https://guilhermetrent.com.br';

// Robôs de IA e de raspagem de dados: bloqueados no site todo (o conteúdo, o visual e o código são do autor).
// Buscadores (Google, Bing) e os robôs de prévia de link (LinkedIn, WhatsApp, Discord, X) continuam liberados:
// recrutador precisa achar o site e ver a prévia quando o link é compartilhado.
// O robots.txt é um pedido, não uma tranca: os robôs sérios obedecem; quem quer copiar de má-fé ignora.
const ROBOS_BLOQUEADOS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'Claude-SearchBot',
  'anthropic-ai',
  'Google-Extended',
  'Google-CloudVertexBot',
  'Applebot-Extended',
  'CCBot',
  'PerplexityBot',
  'Perplexity-User',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'Meta-ExternalFetcher',
  'FacebookBot',
  'cohere-ai',
  'cohere-training-data-crawler',
  'Diffbot',
  'ImagesiftBot',
  'Omgilibot',
  'Timpibot',
  'YouBot',
  'AI2Bot',
  'DuckAssistBot',
  'MistralAI-User',
  'PetalBot',
  'img2dataset',
  'FirecrawlAgent',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: ROBOS_BLOQUEADOS, disallow: '/' },
      { userAgent: '*', allow: '/' },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
