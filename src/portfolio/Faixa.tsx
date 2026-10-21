/**
 * Uma faixa correndo, como letreiro: o conteúdo é repetido duas vezes e desliza metade da largura em loop,
 * então a emenda nunca aparece. Puro CSS. `reverso`: corre para o outro lado.
 */
export function Faixa({ itens, reverso = false }: { itens: string[]; reverso?: boolean }) {
  const trecho = (copia: number) => (
    <div className="faixa-trecho" aria-hidden={copia > 0 || undefined}>
      {itens.map((item) => (
        <span key={item + copia}>
          {item}
          <i aria-hidden="true">◆</i>
        </span>
      ))}
    </div>
  );
  return (
    <div className={`faixa ${reverso ? 'faixa-reversa' : ''}`}>
      <div className="faixa-trilho">
        {trecho(0)}
        {trecho(1)}
      </div>
    </div>
  );
}
