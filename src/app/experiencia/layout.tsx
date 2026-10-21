/**
 * A experiência 3D ocupa a tela inteira e não rola: o gesto de arrastar é do motor, não da página.
 * (O layout raiz libera a rolagem para o portfólio.)
 */
export default function LayoutDaExperiencia({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 overflow-hidden">{children}</div>;
}
