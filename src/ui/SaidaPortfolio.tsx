/**
 * A saída da experiência para o portfólio, sempre visível e discreta (canto superior direito, livre em
 * todas as cenas). É um link comum de propósito: a navegação completa descarta o WebGL e a página
 * principal abre leve. Quem chega direto aqui (um recrutador com pressa) nunca fica preso na jornada.
 */
export function SaidaPortfolio() {
  return (
    // <a> e não <Link>: a navegação completa é proposital (descarta o WebGL e a memória da GPU).
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a
      href="/"
      className="pointer-events-auto fixed right-[max(1rem,env(safe-area-inset-right))] top-[max(0.9rem,env(safe-area-inset-top))] z-20 font-mono text-[10px] uppercase tracking-[0.28em] text-white/40 transition-colors hover:text-white focus-visible:text-white"
    >
      Guilherme Trent <span className="text-white/25">·</span> portfólio
    </a>
  );
}
