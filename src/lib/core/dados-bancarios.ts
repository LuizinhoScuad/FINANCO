import type { DadosBancarios, TipoChavePix, TipoConta } from "@/types";

/**
 * Dados para reembolso — validação, normalização e leitura.
 *
 * Existe porque o pagamento sai por fora do sistema: alguém do financeiro lê o
 * comprovante e deposita. Um dígito errado aqui é dinheiro no lugar errado, e
 * quem digita não recebe aviso nenhum do banco — por isso o CPF tem os dígitos
 * verificadores conferidos e a chave PIX é validada contra o tipo escolhido.
 *
 * Função pura de propósito: não toca banco, não depende de sessão, e por isso é
 * testada sem emulador (Art. 7). É também o que permite `lerDadosBancarios`
 * rodar tanto no repositório quanto no portão de acesso.
 */

export const TIPOS_CHAVE_PIX: ReadonlyArray<{ valor: TipoChavePix; rotulo: string }> = [
  { valor: "CPF", rotulo: "CPF" },
  { valor: "CNPJ", rotulo: "CNPJ" },
  { valor: "EMAIL", rotulo: "E-mail" },
  { valor: "TELEFONE", rotulo: "Telefone" },
  { valor: "ALEATORIA", rotulo: "Chave aleatória" },
] as const;

export const TIPOS_CONTA: ReadonlyArray<{ valor: TipoConta; rotulo: string }> = [
  { valor: "CORRENTE", rotulo: "Conta corrente" },
  { valor: "POUPANCA", rotulo: "Poupança" },
] as const;

const ROTULO_PIX = new Map(TIPOS_CHAVE_PIX.map((t) => [t.valor, t.rotulo]));
const ROTULO_CONTA = new Map(TIPOS_CONTA.map((t) => [t.valor, t.rotulo]));

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function ehTipoChavePix(valor: unknown): valor is TipoChavePix {
  return TIPOS_CHAVE_PIX.some((t) => t.valor === valor);
}

export function ehTipoConta(valor: unknown): valor is TipoConta {
  return TIPOS_CONTA.some((t) => t.valor === valor);
}

// --- documentos --------------------------------------------------------------

/** CPF com os dois dígitos verificadores conferidos. Aceita com ou sem máscara. */
export function validarCPF(entrada: string): boolean {
  const cpf = somenteDigitos(entrada);
  if (cpf.length !== 11) return false;

  // 000.000.000-00, 111.111.111-11 e afins passam no cálculo do dígito, mas não
  // são CPF de ninguém — é o erro típico de quem preenche por preencher.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

/**
 * CNPJ com os dois dígitos verificadores conferidos.
 *
 * Aceita o formato alfanumérico: as 12 primeiras posições podem ser letras ou
 * números, e o valor de cada uma é o código ASCII menos 48 — o mesmo cálculo
 * mod-11 de sempre. Os dois dígitos finais continuam numéricos.
 */
export function validarCNPJ(entrada: string): boolean {
  const cnpj = entrada.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (cnpj.length !== 14) return false;
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false;

  const valor = (c: string) => c.charCodeAt(0) - 48;

  const digito = (ate: number) => {
    let peso = 2;
    let soma = 0;
    for (let i = ate - 1; i >= 0; i--) {
      soma += valor(cnpj[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return digito(12) === Number(cnpj[12]) && digito(13) === Number(cnpj[13]);
}

// --- chave PIX ---------------------------------------------------------------

export type ChaveNormalizada = { ok: true; chave: string } | { ok: false; erro: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Valida a chave contra o tipo e devolve a forma que fica gravada.
 *
 * Normalizar na entrada evita a mesma chave gravada de três jeitos diferentes
 * ("(11) 91234-5678", "11912345678", "+5511912345678") — e é a forma gravada
 * que sai no comprovante, para ser copiada e colada por quem paga.
 */
export function normalizarChavePix(tipo: TipoChavePix, entrada: string): ChaveNormalizada {
  const bruta = entrada.trim();
  if (!bruta) return { ok: false, erro: "Informe a chave PIX." };

  switch (tipo) {
    case "CPF": {
      const cpf = somenteDigitos(bruta);
      if (!validarCPF(cpf)) return { ok: false, erro: "Chave PIX de CPF inválida." };
      return { ok: true, chave: cpf };
    }

    case "CNPJ": {
      const cnpj = bruta.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
      if (!validarCNPJ(cnpj)) return { ok: false, erro: "Chave PIX de CNPJ inválida." };
      return { ok: true, chave: cnpj };
    }

    case "EMAIL": {
      const email = bruta.toLowerCase();
      if (!EMAIL.test(email)) return { ok: false, erro: "Chave PIX de e-mail inválida." };
      return { ok: true, chave: email };
    }

    case "TELEFONE": {
      let digitos = somenteDigitos(bruta);

      // Quem escreveu o "+" declarou o país, e é a única pista confiável:
      // "+1 415 555 0100" tem os mesmos 11 dígitos de um celular brasileiro, e
      // sem esta checagem entraria como se fosse um.
      if (bruta.startsWith("+") && !digitos.startsWith("55")) {
        return { ok: false, erro: "Telefone com código de país diferente de +55." };
      }

      // Aceita "(11) 91234-5678", "11912345678" e "+55 11 91234-5678": o que
      // fica gravado é sempre o formato do PIX, com o código do país.
      if (digitos.length === 12 || digitos.length === 13) {
        if (!digitos.startsWith("55")) {
          return { ok: false, erro: "Telefone com código de país diferente de +55." };
        }
        digitos = digitos.slice(2);
      }
      if (digitos.length !== 10 && digitos.length !== 11) {
        return { ok: false, erro: "Telefone deve ter DDD e 8 ou 9 dígitos." };
      }
      return { ok: true, chave: `+55${digitos}` };
    }

    case "ALEATORIA": {
      const chave = bruta.toLowerCase();
      if (!UUID.test(chave)) {
        return { ok: false, erro: "Chave aleatória deve ter o formato fornecido pelo banco." };
      }
      return { ok: true, chave };
    }
  }
}

// --- leitura do que está gravado ---------------------------------------------

/**
 * Converte uma data vinda do Firestore sem importar o SDK.
 *
 * Importar `Timestamp` aqui arrastaria `firebase-admin` para dentro de um
 * módulo puro, e o portão rápido de testes recusa isso de propósito. Duck
 * typing resolve: o que interessa é ter `toDate()`.
 */
function paraData(valor: unknown): Date | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;

  if (typeof valor === "object" && valor !== null && "toDate" in valor) {
    const converter = (valor as { toDate: unknown }).toDate;
    if (typeof converter === "function") {
      const d = (converter as () => unknown).call(valor);
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
    }
    return null;
  }

  if (typeof valor === "string") {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function textoOuNulo(valor: unknown): string | null {
  const t = texto(valor);
  return t || null;
}

/**
 * Lê o mapa gravado. Ausente, incompleto ou corrompido devolve `null`.
 *
 * "Sem dados" é o padrão seguro: aciona o portão de cadastro em vez de deixar
 * um comprovante sair com meia informação (Art. 6, RNF-12).
 */
export function lerDadosBancarios(valor: unknown): DadosBancarios | null {
  if (typeof valor !== "object" || valor === null) return null;
  const d = valor as Record<string, unknown>;

  const titular = texto(d.titular);
  const cpf = somenteDigitos(texto(d.cpf));
  const pixTipo = d.pixTipo;
  const pixChave = texto(d.pixChave);

  if (!titular || !validarCPF(cpf) || !ehTipoChavePix(pixTipo) || !pixChave) return null;

  return {
    titular,
    cpf,
    pixTipo,
    pixChave,
    banco: textoOuNulo(d.banco),
    agencia: textoOuNulo(d.agencia),
    conta: textoOuNulo(d.conta),
    tipoConta: ehTipoConta(d.tipoConta) ? d.tipoConta : null,
    atualizadoEm: paraData(d.atualizadoEm) ?? new Date(0),
  };
}

// --- apresentação ------------------------------------------------------------

export function formatarCPF(entrada: string): string {
  const cpf = somenteDigitos(entrada);
  if (cpf.length !== 11) return entrada;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export function formatarChavePix(tipo: TipoChavePix, chave: string): string {
  if (tipo === "CPF") return formatarCPF(chave);

  if (tipo === "TELEFONE") {
    const d = somenteDigitos(chave).replace(/^55/, "");
    if (d.length === 11) return `+55 (${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `+55 (${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }

  return chave;
}

/**
 * As linhas que aparecem no comprovante e no painel do administrador.
 *
 * Fonte única: o PDF que vai para quem paga e a tela que o gestor confere
 * mostram exatamente a mesma coisa, na mesma ordem.
 *
 * O CPF sai completo, sem máscara de privacidade: é dado necessário para o
 * depósito, e só o dono e o administrador chegam até aqui (Art. 4).
 */
export function descreverDadosBancarios(
  dados: DadosBancarios,
): Array<{ rotulo: string; valor: string }> {
  const linhas = [
    { rotulo: "Titular", valor: dados.titular },
    { rotulo: "CPF", valor: formatarCPF(dados.cpf) },
    {
      rotulo: `PIX (${ROTULO_PIX.get(dados.pixTipo) ?? dados.pixTipo})`,
      valor: formatarChavePix(dados.pixTipo, dados.pixChave),
    },
  ];

  if (dados.banco) linhas.push({ rotulo: "Banco", valor: dados.banco });
  if (dados.agencia) linhas.push({ rotulo: "Agência", valor: dados.agencia });
  if (dados.conta) {
    const tipo = dados.tipoConta ? ` (${ROTULO_CONTA.get(dados.tipoConta)})` : "";
    linhas.push({ rotulo: "Conta", valor: `${dados.conta}${tipo}` });
  }

  return linhas;
}
