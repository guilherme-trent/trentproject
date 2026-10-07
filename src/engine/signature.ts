/**
 * A assinatura no console — easter egg e marca de autoria para quem abre o
 * DevTools (exatamente o público que se pergunta "como isso foi feito?").
 * Uma vez por carregamento (o StrictMode monta efeitos duas vezes em dev).
 */
let signed = false;

export function printSignature() {
  if (signed || typeof window === 'undefined') return;
  signed = true;
  const frame = 'font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #34d399; letter-spacing: 0.3em;';
  console.log(
    '%c▲ ROOT ACCESS GRANTED %c\n\n%cWelcome to the architecture of %cGuilherme Costa Ribeiro%c.\n',
    `${frame} background: #04130d; padding: 6px 10px; border: 1px solid #34d399;`,
    '',
    'font-family: Georgia, serif; font-style: italic; font-size: 16px; color: #e5e7eb;',
    'font-family: Georgia, serif; font-style: italic; font-size: 16px; color: #6ee7b7; text-shadow: 0 0 12px rgba(110,231,183,0.6);',
    'font-family: Georgia, serif; font-style: italic; font-size: 16px; color: #e5e7eb;',
  );
}
