/**
 * Utilitários de autoria GLSL.
 *
 * Shaders vivem como template strings em arquivos `.glsl.ts` (e não `.glsl`):
 *   - zero configuração de bundler (Turbopack/Webpack não precisam de raw-loader);
 *   - constantes TypeScript podem ser interpoladas no GLSL → UMA fonte de
 *     verdade para valores que CPU e GPU precisam concordar (ex.: durações);
 *   - chunks se compõem por interpolação, com include guards (#ifndef) que
 *     tornam inclusões repetidas inofensivas.
 *
 * Dica: a extensão "Comment tagged templates" / "glsl-literal" do VS Code dá
 * syntax highlighting para literais com a tag `glsl`.
 */

/**
 * Tag identidade. Só aceita strings: números precisam passar por `float()`/`int()`
 * porque `1` em GLSL é int e `1.0` é float — misturar quebra a compilação.
 */
export const glsl = (strings: TemplateStringsArray, ...values: readonly string[]): string =>
  String.raw({ raw: strings }, ...values);

/** Formata um número como literal float GLSL (`2` → `"2.0"`). */
export function float(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`GLSL float inválido: ${value}`);
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

/** Formata um número como literal int GLSL. */
export function int(value: number): string {
  if (!Number.isInteger(value)) throw new Error(`GLSL int inválido: ${value}`);
  return String(value);
}

/** Formata uma cor/vetor RGB como literal `vec3` GLSL. */
export function vec3(value: readonly [number, number, number]): string {
  return `vec3(${value.map(float).join(', ')})`;
}
