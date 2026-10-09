/**
 * A assinatura no console — easter egg e marca de autoria para quem abre o
 * DevTools (exatamente o público que se pergunta "como isso foi feito?").
 * Uma vez por carregamento (o StrictMode monta efeitos duas vezes em dev).
 */
let signed = false;

export function printSignature() {
  if (signed || typeof window === 'undefined') return;
  signed = true;
  const mono = 'font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #34d399; font-weight: bold;';
  const serif = 'font-family: Georgia, serif; font-style: italic; font-size: 15px; color: #e5e7eb;';
  // O texto copiado do console é exatamente: "Root Access Granted. Welcome to the architecture of Guilherme Costa Ribeiro."
  console.log(
    '%cRoot Access Granted. %cWelcome to the architecture of %cGuilherme Costa Ribeiro%c.',
    mono,
    serif,
    `${serif} color: #6ee7b7; text-shadow: 0 0 12px rgba(110,231,183,0.6);`,
    serif,
  );
}
