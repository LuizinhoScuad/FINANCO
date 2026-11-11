/**
 * Firestore EM MEMÓRIA — para simular o ciclo do app sem credencial nem Java.
 *
 * Implementa só o que os repositórios usam: coleção, documento, `where`,
 * `orderBy`, `limit`, `count`, `collectionGroup`, `runTransaction`, `batch`,
 * `FieldValue.increment` e `arrayUnion`, `set` com `merge`. Nada de regras de
 * segurança, nada de concorrência: a transação aplica as escritas na hora,
 * porque o teste é sequencial.
 *
 * Não substitui `npm run test:integracao`, que fala com o Firestore real. Serve
 * para a máquina que não tem o `.env` preenchido provar a lógica de ponta a
 * ponta — e para o teste ser determinístico.
 *
 * Nada aqui alcança o Firestore real: tudo vive num `Map` que morre com o
 * processo. Ainda assim, os testes que o usam semeiam com o prefixo
 * `zzz-teste-`, para que um dia a mesma suíte possa apontar para o banco real
 * sem mudar nenhum identificador (HARNESS §3).
 */

type Dados = Record<string, unknown>;

class Sentinela {
  constructor(public readonly tipo: "increment" | "arrayUnion", public readonly valor: unknown) {}
}

export const FieldValue = {
  increment: (n: number) => new Sentinela("increment", n),
  arrayUnion: (...itens: unknown[]) => new Sentinela("arrayUnion", itens),
};

export class Timestamp {
  constructor(private readonly d: Date) {}
  toDate() {
    return this.d;
  }
}

function clonar<T>(v: T): T {
  if (v instanceof Date) return new Date(v.getTime()) as T;
  if (Array.isArray(v)) return v.map(clonar) as T;
  if (v && typeof v === "object" && !(v instanceof Sentinela)) {
    const o: Dados = {};
    for (const [k, x] of Object.entries(v as Dados)) o[k] = clonar(x);
    return o as T;
  }
  return v;
}

function aplicar(atual: Dados | undefined, patch: Dados, merge: boolean): Dados {
  const base: Dados = merge && atual ? clonar(atual) : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v instanceof Sentinela) {
      if (v.tipo === "increment") base[k] = (Number(base[k]) || 0) + (v.valor as number);
      else base[k] = [...((base[k] as unknown[]) ?? []), ...clonar(v.valor as unknown[])];
    } else if (merge && v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && base[k] && typeof base[k] === "object") {
      base[k] = aplicar(base[k] as Dados, v as Dados, true);
    } else {
      base[k] = clonar(v);
    }
  }
  return base;
}

function comparar(a: unknown, b: unknown): number {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  if (x === y) return 0;
  if (x === undefined || x === null) return -1;
  if (y === undefined || y === null) return 1;
  return (x as number | string) < (y as number | string) ? -1 : 1;
}

export class BancoEmMemoria {
  private docs = new Map<string, Dados>();

  collection(caminho: string) {
    return new Colecao(this, caminho);
  }

  doc(caminho: string) {
    return new Documento(this, caminho);
  }

  collectionGroup(nome: string) {
    return new Consulta(this, null, nome);
  }

  async runTransaction<T>(fn: (t: Transacao) => Promise<T>): Promise<T> {
    return fn(new Transacao(this));
  }

  batch() {
    return new Lote(this);
  }

  // --- interno ---------------------------------------------------------------

  ler(caminho: string): Dados | undefined {
    const d = this.docs.get(caminho);
    return d ? clonar(d) : undefined;
  }

  gravar(caminho: string, dados: Dados, merge = false) {
    this.docs.set(caminho, aplicar(this.docs.get(caminho), dados, merge));
  }

  atualizar(caminho: string, patch: Dados) {
    if (!this.docs.has(caminho)) throw new Error(`5 NOT_FOUND: ${caminho}`);
    this.gravar(caminho, patch, true);
  }

  criar(caminho: string, dados: Dados) {
    if (this.docs.has(caminho)) {
      const erro = new Error(`6 ALREADY_EXISTS: ${caminho}`) as Error & { code: number };
      erro.code = 6;
      throw erro;
    }
    this.gravar(caminho, dados);
  }

  apagar(caminho: string) {
    this.docs.delete(caminho);
  }

  /** Documentos de uma coleção (caminho exato) ou de um grupo (último segmento). */
  listar(colecao: string | null, grupo: string | null): Array<{ caminho: string; dados: Dados }> {
    const saida: Array<{ caminho: string; dados: Dados }> = [];
    for (const [caminho, dados] of this.docs) {
      const partes = caminho.split("/");
      const pai = partes.slice(0, -1).join("/");
      if (colecao !== null && pai !== colecao) continue;
      if (grupo !== null && partes[partes.length - 2] !== grupo) continue;
      saida.push({ caminho, dados: clonar(dados) });
    }
    return saida;
  }

  tudo() {
    return new Map(this.docs);
  }
}

export class Documento {
  constructor(readonly banco: BancoEmMemoria, readonly path: string) {}
  get id() {
    return this.path.split("/").pop()!;
  }
  get parent() {
    return new Colecao(this.banco, this.path.split("/").slice(0, -1).join("/"));
  }
  collection(nome: string) {
    return new Colecao(this.banco, `${this.path}/${nome}`);
  }
  async get() {
    return new Snap(this, this.banco.ler(this.path));
  }
  async set(dados: Dados, opcoes?: { merge?: boolean }) {
    this.banco.gravar(this.path, dados, opcoes?.merge === true);
  }
  async update(patch: Dados) {
    this.banco.atualizar(this.path, patch);
  }
  async delete() {
    this.banco.apagar(this.path);
  }
}

export class Snap {
  constructor(readonly ref: Documento, private readonly dados: Dados | undefined) {}
  get exists() {
    return this.dados !== undefined;
  }
  get id() {
    return this.ref.id;
  }
  data() {
    return this.dados;
  }
}

type Filtro = { campo: string; op: string; valor: unknown };

export class Consulta {
  protected filtros: Filtro[] = [];
  protected ordem: Array<{ campo: string; dir: "asc" | "desc" }> = [];
  protected teto: number | null = null;

  constructor(readonly banco: BancoEmMemoria, readonly caminho: string | null, readonly grupo: string | null) {}

  protected copiar(): Consulta {
    const c = new Consulta(this.banco, this.caminho, this.grupo);
    c.filtros = [...this.filtros];
    c.ordem = [...this.ordem];
    c.teto = this.teto;
    return c;
  }

  where(campo: string, op: string, valor: unknown) {
    const c = this.copiar();
    c.filtros.push({ campo, op, valor });
    return c;
  }

  orderBy(campo: string, dir: "asc" | "desc" = "asc") {
    const c = this.copiar();
    c.ordem.push({ campo, dir });
    return c;
  }

  limit(n: number) {
    const c = this.copiar();
    c.teto = n;
    return c;
  }

  count() {
    return {
      get: async () => {
        const { size } = await this.get();
        return { data: () => ({ count: size }) };
      },
    };
  }

  async get() {
    let itens = this.banco.listar(this.caminho, this.grupo);
    for (const f of this.filtros) {
      itens = itens.filter(({ dados }) => {
        const v = dados[f.campo];
        switch (f.op) {
          case "==":
            return comparar(v, f.valor) === 0;
          case "!=":
            return comparar(v, f.valor) !== 0;
          case ">=":
            return v !== undefined && comparar(v, f.valor) >= 0;
          case "<=":
            return v !== undefined && comparar(v, f.valor) <= 0;
          case ">":
            return v !== undefined && comparar(v, f.valor) > 0;
          case "<":
            return v !== undefined && comparar(v, f.valor) < 0;
          case "in":
            return (f.valor as unknown[]).some((x) => comparar(v, x) === 0);
          default:
            throw new Error(`operador não simulado: ${f.op}`);
        }
      });
    }
    for (const o of [...this.ordem].reverse()) {
      itens.sort((a, b) => (o.dir === "asc" ? 1 : -1) * comparar(a.dados[o.campo], b.dados[o.campo]));
    }
    if (this.teto !== null) itens = itens.slice(0, this.teto);
    const docs = itens.map(({ caminho, dados }) => new Snap(new Documento(this.banco, caminho), dados));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

let contador = 0;

export class Colecao extends Consulta {
  constructor(banco: BancoEmMemoria, caminho: string) {
    super(banco, caminho, null);
  }
  get firestore() {
    return this.banco;
  }
  /** `users/{uid}/transactions` → o documento `users/{uid}`; coleção de topo → null. */
  get parent(): Documento | null {
    const partes = this.caminho!.split("/");
    return partes.length > 1 ? new Documento(this.banco, partes.slice(0, -1).join("/")) : null;
  }
  doc(id?: string) {
    return new Documento(this.banco, `${this.caminho}/${id ?? `auto-${++contador}`}`);
  }
  async add(dados: Dados) {
    const ref = this.doc();
    await ref.set(dados);
    return ref;
  }
}

/** Aplica na hora: o teste é sequencial, não há concorrência a isolar. */
export class Transacao {
  constructor(private readonly banco: BancoEmMemoria) {}
  async get(ref: Documento) {
    return ref.get();
  }
  create(ref: Documento, dados: Dados) {
    this.banco.criar(ref.path, dados);
  }
  set(ref: Documento, dados: Dados, opcoes?: { merge?: boolean }) {
    this.banco.gravar(ref.path, dados, opcoes?.merge === true);
  }
  update(ref: Documento, patch: Dados) {
    this.banco.atualizar(ref.path, patch);
  }
  delete(ref: Documento) {
    this.banco.apagar(ref.path);
  }
}

export class Lote {
  private fila: Array<() => void> = [];
  constructor(private readonly banco: BancoEmMemoria) {}
  set(ref: Documento, dados: Dados, opcoes?: { merge?: boolean }) {
    this.fila.push(() => this.banco.gravar(ref.path, dados, opcoes?.merge === true));
    return this;
  }
  update(ref: Documento, patch: Dados) {
    this.fila.push(() => this.banco.atualizar(ref.path, patch));
    return this;
  }
  delete(ref: Documento) {
    this.fila.push(() => this.banco.apagar(ref.path));
    return this;
  }
  async commit() {
    for (const f of this.fila) f();
    this.fila = [];
  }
}
