/** Só o que os testes usam do Node (evita instalar @types/node para uma função). */
declare module 'node:fs' {
  export function readFileSync(caminho: string | URL): Uint8Array;
}
