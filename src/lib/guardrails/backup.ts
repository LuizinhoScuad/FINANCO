import "server-only";
import { getStorage } from "firebase-admin/storage";
import { gerarSnapshot } from "@/lib/core/repositories/snapshot.repo";

/**
 * Rede de segurança antes de operação destrutiva — Art. 1.
 *
 * Nenhuma restauração de backup acontece sem que o estado atual tenha sido
 * guardado primeiro. Se a gravação da cópia falhar, a operação é abortada:
 * é melhor não restaurar do que restaurar sem volta.
 */

export type CopiaDeSeguranca = {
  caminho: string;
  bytes: number;
  registros: number;
};

export async function copiarAntesDeSobrescrever(uid: string): Promise<CopiaDeSeguranca> {
  const snapshot = await gerarSnapshot();

  const registros =
    snapshot.accounts.length +
    snapshot.categories.length +
    snapshot.budgets.length +
    snapshot.transactions.length;

  const conteudo = JSON.stringify(snapshot, null, 2);
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const caminho = `backups/${uid}/${carimbo}.json`;

  const arquivo = getStorage().bucket().file(caminho);
  await arquivo.save(conteudo, {
    contentType: "application/json",
    metadata: {
      metadata: {
        origem: "restauracao-automatica",
        registros: String(registros),
        geradoEm: new Date().toISOString(),
      },
    },
  });

  // Confere que gravou mesmo: um backup que não existe é pior que nenhum,
  // porque dá falsa sensação de segurança.
  const [existe] = await arquivo.exists();
  if (!existe) {
    throw new Error("A cópia de segurança não pôde ser confirmada. Nada foi alterado.");
  }

  return { caminho, bytes: Buffer.byteLength(conteudo), registros };
}
