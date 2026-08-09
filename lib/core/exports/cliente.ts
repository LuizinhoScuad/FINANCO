"use client";

import { formatarCentavos, paraReais } from "@/lib/core/money";
import { rotulo } from "@/lib/core/expense-status";
import type { Expense, ExpenseCategory, PaymentBatch } from "@/types";

/**
 * Exportação em PDF e XLSX — gerada NO NAVEGADOR.
 *
 * Sem custo de servidor (RNF-10) e funciona igual no celular e no computador.
 * No celular, o PDF abre direto e pode ir para o WhatsApp.
 *
 * As bibliotecas entram por import dinâmico: são pesadas e não fazem sentido no
 * pacote inicial de quem só quer registrar uma despesa na rua.
 */

const MARCA = { r: 0, g: 217, b: 139 };

function carimbo() {
  return new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function nomeArquivo(base: string, ext: string) {
  const dia = new Date().toISOString().slice(0, 10);
  return `${base}-${dia}.${ext}`;
}

function dataCurta(d: Date | string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(d));
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

// --- despesas de ressarcimento ----------------------------------------------

function totaisPorCategoria(despesas: Expense[], categorias: ExpenseCategory[]) {
  const mapa = new Map<string, number>();
  for (const d of despesas) {
    mapa.set(d.categoryId, (mapa.get(d.categoryId) ?? 0) + d.amountCents);
  }
  return Array.from(mapa.entries())
    .map(([id, cents]) => ({
      nome: categorias.find((c) => c.id === id)?.name ?? "Sem categoria",
      cents,
    }))
    .sort((a, b) => b.cents - a.cents);
}

export async function exportarDespesasPDF(
  despesas: Expense[],
  categorias: ExpenseCategory[],
  titulo: string,
  subtitulo?: string,
) {
  const nome = (id: string) => categorias.find((c) => c.id === id)?.name ?? "—";

  await montarPDF({
    titulo,
    subtitulo,
    colunas: ["Data", "Pessoa", "Descrição", "Categoria", "Comprov.", "Situação", "Valor"],
    linhas: despesas.map((d) => [
      dataCurta(d.date),
      d.userName,
      d.description,
      nome(d.categoryId),
      d.receiptUrl ? "sim" : "NÃO",
      rotulo(d.status),
      formatarCentavos(d.amountCents),
    ]),
    resumo: [
      { rotulo: "Quantidade de despesas", valor: String(despesas.length) },
      {
        rotulo: "Sem comprovante",
        valor: String(despesas.filter((d) => !d.receiptUrl).length),
      },
      ...totaisPorCategoria(despesas, categorias).map((t) => ({
        rotulo: t.nome,
        valor: formatarCentavos(t.cents),
      })),
      {
        rotulo: "TOTAL",
        valor: formatarCentavos(despesas.reduce((s, d) => s + d.amountCents, 0)),
      },
    ],
    arquivo: nomeArquivo(titulo.toLowerCase().replace(/\s+/g, "-"), "pdf"),
  });
}

export async function exportarDespesasXLSX(
  despesas: Expense[],
  categorias: ExpenseCategory[],
  base: string,
) {
  const nome = (id: string) => categorias.find((c) => c.id === id)?.name ?? "—";

  await montarXLSX({
    aba: "Despesas",
    colunas: [
      { header: "Data", key: "data", width: 12 },
      { header: "Pessoa", key: "pessoa", width: 22 },
      { header: "Descrição", key: "descricao", width: 34 },
      { header: "Categoria", key: "categoria", width: 18 },
      { header: "Comprovante", key: "comprovante", width: 14 },
      { header: "Situação", key: "situacao", width: 14 },
      { header: "Valor", key: "valor", width: 14 },
    ],
    linhas: despesas.map((d) => ({
      data: dataCurta(d.date),
      pessoa: d.userName,
      descricao: d.description,
      categoria: nome(d.categoryId),
      comprovante: d.receiptUrl ? "sim" : "NÃO",
      situacao: rotulo(d.status),
      valor: paraReais(d.amountCents),
    })),
    colunaMoeda: "valor",
    arquivo: nomeArquivo(base, "xlsx"),
  });
}

/** Comprovante de fechamento — o PDF que o gestor manda para o colaborador. */
export async function exportarComprovanteDeLote(
  lote: PaymentBatch,
  despesas: Expense[],
  categorias: ExpenseCategory[],
) {
  const nome = (id: string) => categorias.find((c) => c.id === id)?.name ?? "—";

  await montarPDF({
    titulo: "Comprovante de ressarcimento",
    subtitulo: `${lote.userName} · período ${dataCurta(lote.periodStart)} a ${dataCurta(lote.periodEnd)}`,
    colunas: ["Data", "Descrição", "Categoria", "Comprov.", "Valor"],
    linhas: despesas.map((d) => [
      dataCurta(d.date),
      d.description,
      nome(d.categoryId),
      d.receiptUrl ? "sim" : "NÃO",
      formatarCentavos(d.amountCents),
    ]),
    resumo: [
      { rotulo: "Despesas ressarcidas", valor: String(lote.expenseCount) },
      { rotulo: "Pago em", valor: lote.paidAt ? dataCurta(lote.paidAt) : "—" },
      { rotulo: "TOTAL RESSARCIDO", valor: formatarCentavos(lote.totalCents) },
    ],
    arquivo: nomeArquivo(`ressarcimento-${lote.userName.toLowerCase().replace(/\s+/g, "-")}`, "pdf"),
  });
}

// --- transações pessoais (retrofit: antes só tinha XLSX) ---------------------

export type LinhaTransacao = {
  data: string;
  descricao: string;
  favorecido: string;
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
      { header: "Favorecido", key: "favorecido", width: 20 },
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
