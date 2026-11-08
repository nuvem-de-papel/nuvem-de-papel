// Validacao de CPF/CNPJ pelos digitos verificadores — usada na server action
// de venda manual (defesa no servidor) e no console (feedback imediato antes
// de enviar). Mesma regra das functions locais de configuracoes/cadastro/actions.ts.

const digitos = (v: string) => (v ?? "").replace(/\D/g, "");

export function cpfValido(valor: string): boolean {
  const c = digitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(c.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(c[9]) && d2 === Number(c[10]);
}

export function cnpjValido(valor: string): boolean {
  const c = digitos(valor);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const dv1 = calc(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = calc(c.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === Number(c[12]) && dv2 === Number(c[13]);
}

/** true quando os digitos verificadores conferem para o tipo declarado. */
export function documentoValido(tipo: "fisica" | "juridica", valor: string): boolean {
  return tipo === "fisica" ? cpfValido(valor) : cnpjValido(valor);
}
