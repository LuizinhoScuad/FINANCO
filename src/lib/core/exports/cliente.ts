"use client";

/**
 * Exportação em PDF e XLSX — gerada NO NAVEGADOR.
 *
 * Sem custo de servidor (RNF-10) e funciona igual no celular e no computador.
 * No celular, o PDF abre direto e pode ir para o WhatsApp.
 *
 * As bibliotecas entram por import dinâmico: são pesadas e não fazem sentido no
 * pacote inicial de quem só quer registrar um lançamento na rua.
 */

const MARCA = { r: 0, g: 217, b: 139 };

function carimbo() {
  return new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function nomeArquivo(base: string, ext: string) {
  const dia = new Date().toISOString().slice(0, 10);
  return `${base}-${dia}.${ext}`;
}

// --- PDF ---------------------------------------------------------------------

type LinhaPDF = string[];

async function montarPDF(opcoes: {
  titulo: string;
  subtitulo?: string;
  colunas: string[];
  linhas: LinhaPDF[];
  resumo?: Array<{ rotulo: string; valor: string }>;
  arquivo: string;
}) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();

  doc.setFillColor(MARCA.r, MARCA.g, MARCA.b);
  doc.rect(0, 0, largura, 3, "F");

  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text("FINANCO", 14, 16);

  doc.setFontSize(12);
  doc.text(opcoes.titulo, 14, 24);

  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  if (opcoes.subtitulo) doc.text(opcoes.subtitulo, 14, 30);
  doc.text(`Gerado em ${carimbo()}`, largura - 14, 16, { align: "right" });

  autoTable(doc, {
    startY: opcoes.subtitulo ? 36 : 30,
    head: [opcoes.colunas],
    body: opcoes.linhas,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [17, 24, 39], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 245] },
    columnStyles: { [opcoes.colunas.length - 1]: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  if (opcoes.resumo?.length) {
    // @ts-expect-error — autoTable grava a posição final no documento
    let y = (doc.lastAutoTable?.finalY ?? 40) + 10;

    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text("Resumo", 14, y);
    y += 6;

    doc.setFontSize(9);
    for (const item of opcoes.resumo) {
      doc.setTextColor(110, 110, 110);
      doc.text(item.rotulo, 14, y);
      doc.setTextColor(20, 20, 20);
      doc.text(item.valor, largura - 14, y, { align: "right" });
      y += 5;
    }
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Página ${i} de ${total}`, largura / 2, doc.internal.pageSize.getHeight() - 8, {
      align: "center",
    });
  }

  doc.save(opcoes.arquivo);
}

// --- XLSX --------------------------------------------------------------------

async function montarXLSX(opcoes: {
  aba: string;
  colunas: Array<{ header: string; key: string; width: number }>;
  linhas: Record<string, unknown>[];
  colunaMoeda?: string;
  arquivo: string;
}) {
  const ExcelJS = (await import("exceljs")).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Financo";
  wb.created = new Date();

  const ws = wb.addWorksheet(opcoes.aba);
  ws.columns = opcoes.colunas;

  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const linha of opcoes.linhas) ws.addRow(linha);

  if (opcoes.colunaMoeda) {
    ws.getColumn(opcoes.colunaMoeda).numFmt = 'R$ #,##0.00';
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: opcoes.colunas.length } };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opcoes.arquivo;
  a.click();
  URL.revokeObjectURL(url);
}

// --- pedidos de reembolso ----------------------------------------------------

function dataCurta(d: Date | string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(d));
}

function dinheiro(reais: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(reais);
}

export type LinhaPedido = {
  data: Date | string;
  pessoa: string;
  descricao: string;
  categoria: string;
  comprovante: boolean;
  situacao: string;
  atendido: boolean;
  atendidoEm: Date | null;
  valor: number;
};

function totaisPorCategoria(linhas: LinhaPedido[]) {
  const mapa = new Map<string, number>();
  for (const l of linhas) mapa.set(l.categoria, (mapa.get(l.categoria) ?? 0) + l.valor);
  return Array.from(mapa.entries())
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Relatório de pedidos em PDF.
 *
 * O resumo separa o que **já foi atendido** do que ainda está em aberto: é a
 * primeira coisa que a pessoa procura ao abrir o arquivo no WhatsApp, e deixar
 * os dois somados no mesmo total é o jeito mais fácil de alguém cobrar duas
 * vezes o que já recebeu.
 */
export async function exportarPedidosPDF(
  linhas: LinhaPedido[],
  titulo: string,
  subtitulo?: string,
) {
  const atendidos = linhas.filter((l) => l.atendido);
  const emAberto = linhas.filter((l) => !l.atendido);
  const soma = (ls: LinhaPedido[]) => ls.reduce((s, l) => s + l.valor, 0);

  await montarPDF({
    titulo,
    subtitulo,
    colunas: ["Data", "Pessoa", "Descrição", "Categoria", "Comprov.", "Situação", "Valor"],
    linhas: linhas.map((l) => [
      dataCurta(l.data),
      l.pessoa,
      l.descricao,
      l.categoria,
      l.comprovante ? "sim" : "NÃO",
      l.atendido && l.atendidoEm ? `Atendida em ${dataCurta(l.atendidoEm)}` : l.situacao,
      dinheiro(l.valor),
    ]),
    resumo: [
      { rotulo: "Pedidos no período", valor: String(linhas.length) },
      { rotulo: "Sem comprovante", valor: String(linhas.filter((l) => !l.comprovante).length) },
      {
        rotulo: `JÁ ATENDIDOS (${atendidos.length}) — nada a receber`,
        valor: dinheiro(soma(atendidos)),
      },
      { rotulo: `EM ABERTO (${emAberto.length}) — a receber`, valor: dinheiro(soma(emAberto)) },
      ...totaisPorCategoria(linhas).map((t) => ({ rotulo: t.nome, valor: dinheiro(t.total) })),
      { rotulo: "TOTAL GERAL", valor: dinheiro(soma(linhas)) },
    ],
    arquivo: nomeArquivo(titulo.toLowerCase().replace(/\s+/g, "-"), "pdf"),
  });
}

export async function exportarPedidosXLSX(linhas: LinhaPedido[], base: string) {
  await montarXLSX({
    aba: "Pedidos de reembolso",
    colunas: [
      { header: "Data", key: "data", width: 12 },
      { header: "Pessoa", key: "pessoa", width: 22 },
      { header: "Descrição", key: "descricao", width: 34 },
      { header: "Categoria", key: "categoria", width: 18 },
      { header: "Comprovante", key: "comprovante", width: 14 },
      { header: "Situação", key: "situacao", width: 20 },
      { header: "Já atendido", key: "atendido", width: 13 },
      { header: "Atendido em", key: "atendidoEm", width: 14 },
      { header: "Valor", key: "valor", width: 14 },
    ],
    linhas: linhas.map((l) => ({
      data: dataCurta(l.data),
      pessoa: l.pessoa,
      descricao: l.descricao,
      categoria: l.categoria,
      comprovante: l.comprovante ? "sim" : "NÃO",
      situacao: l.situacao,
      atendido: l.atendido ? "SIM" : "não",
      atendidoEm: l.atendidoEm ? dataCurta(l.atendidoEm) : "—",
      valor: l.valor,
    })),
    colunaMoeda: "valor",
    arquivo: nomeArquivo(base, "xlsx"),
  });
}

/** Comprovante de fechamento — o PDF que o gestor manda para a pessoa. */
export async function exportarComprovanteDeLote(
  lote: { userName: string; periodStart: Date; periodEnd: Date; paidAt: Date | null; expenseCount: number; totalCents: number },
  linhas: LinhaPedido[],
) {
  await montarPDF({
    titulo: "Comprovante de reembolso",
    subtitulo: `${lote.userName} · período ${dataCurta(lote.periodStart)} a ${dataCurta(lote.periodEnd)}`,
    colunas: ["Data", "Descrição", "Categoria", "Comprov.", "Valor"],
    linhas: linhas.map((l) => [
      dataCurta(l.data),
      l.descricao,
      l.categoria,
      l.comprovante ? "sim" : "NÃO",
      dinheiro(l.valor),
    ]),
    resumo: [
      { rotulo: "Pedidos atendidos", valor: String(lote.expenseCount) },
      { rotulo: "Pago em", valor: lote.paidAt ? dataCurta(lote.paidAt) : "—" },
      { rotulo: "TOTAL PAGO", valor: dinheiro(lote.totalCents / 100) },
    ],
    arquivo: nomeArquivo(`reembolso-${lote.userName.toLowerCase().replace(/\s+/g, "-")}`, "pdf"),
  });
}

// --- transações -------------------------------------------------------------

export type LinhaTransacao = {
  data: string;
  descricao: string;
  observacao: string;
  categoria: string;
  conta: string;
  tipo: string;
  situacao: string;
  valor: number;
};

export async function exportarTransacoesPDF(linhas: LinhaTransacao[], titulo: string) {
  const total = linhas.reduce((s, l) => s + l.valor, 0);

  await montarPDF({
    titulo,
    colunas: ["Data", "Descrição", "Categoria", "Conta", "Situação", "Valor"],
    linhas: linhas.map((l) => [
      l.data,
      l.descricao,
      l.categoria,
      l.conta,
      l.situacao,
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(l.valor),
    ]),
    resumo: [
      { rotulo: "Lançamentos", valor: String(linhas.length) },
      {
        rotulo: "SALDO DO PERÍODO",
        valor: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total),
      },
    ],
    arquivo: nomeArquivo(titulo.toLowerCase().replace(/\s+/g, "-"), "pdf"),
  });
}

export async function exportarTransacoesXLSX(linhas: LinhaTransacao[], base: string) {
  await montarXLSX({
    aba: "Transações",
    colunas: [
      { header: "Data", key: "data", width: 12 },
      { header: "Descrição", key: "descricao", width: 32 },
      { header: "Observação/Acompanhante", key: "observacao", width: 28 },
      { header: "Categoria", key: "categoria", width: 20 },
      { header: "Conta", key: "conta", width: 16 },
      { header: "Tipo", key: "tipo", width: 10 },
      { header: "Situação", key: "situacao", width: 12 },
      { header: "Valor", key: "valor", width: 14 },
    ],
    linhas: linhas as unknown as Record<string, unknown>[],
    colunaMoeda: "valor",
    arquivo: nomeArquivo(base, "xlsx"),
  });
}
