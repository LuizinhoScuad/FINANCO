"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarDadosBancarios } from "@/actions/dados-bancarios";
import { Aviso } from "@/components/ui/Aviso";
import {
  formatarCPF,
  TIPOS_CHAVE_PIX,
  TIPOS_CONTA,
} from "@/lib/core/dados-bancarios";
import type { DadosBancarios } from "@/types";

/**
 * Formulário de "como quero receber" — um só, para os dois momentos.
 *
 * No primeiro acesso ele é o portão: não há botão de pular, porque sem estes
 * dados ninguém consegue ser reembolsado. Depois, é a tela de edição em "Meus
 * dados". A diferença entre os dois é só o que acontece ao salvar.
 */
export function FormularioDadosBancarios({
  modo,
  nomePadrao,
  inicial,
}: {
  modo: "primeiro-acesso" | "edicao";
  nomePadrao: string;
  inicial: DadosBancarios | null;
}) {
  const router = useRouter();
  const [salvando, startTransition] = useTransition();

  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [campos, setCampos] = useState<Record<string, string[]>>({});
  const [pixTipo, setPixTipo] = useState(inicial?.pixTipo ?? "CPF");
  const [cpf, setCpf] = useState(inicial ? formatarCPF(inicial.cpf) : "");
  const [pixChave, setPixChave] = useState(inicial?.pixChave ?? "");

  function enviar(formData: FormData) {
    setErro("");
    setSucesso("");
    setCampos({});

    startTransition(async () => {
      const r = await salvarDadosBancarios(formData);

      if (!r.ok) {
        setErro(r.error);
        setCampos(r.campos ?? {});
        return;
      }

      if (modo === "primeiro-acesso") {
        router.push("/dashboard");
        router.refresh();
        return;
      }

      setSucesso("Dados salvos.");
      router.refresh();
    });
  }

  const erroDe = (campo: string) => campos[campo]?.[0];

  return (
    <form action={enviar} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {erro && <Aviso tipo="erro" mensagem={erro} onFechar={() => setErro("")} />}
      {sucesso && (
        <Aviso tipo="sucesso" mensagem={sucesso} autoFecharMs={4000} onFechar={() => setSucesso("")} />
      )}

      <Campo rotulo="Nome do titular" erro={erroDe("titular")}>
        <input
          name="titular"
          defaultValue={inicial?.titular ?? nomePadrao}
          placeholder="Quem recebe o depósito"
          required
          style={entrada}
        />
      </Campo>

      <Campo rotulo="CPF do titular" erro={erroDe("cpf")}>
        <input
          name="cpf"
          value={cpf}
          onChange={(e) => setCpf(e.target.value)}
          inputMode="numeric"
          placeholder="000.000.000-00"
          required
          style={entrada}
        />
      </Campo>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) 2fr", gap: "0.75rem" }}>
        <Campo rotulo="Tipo da chave PIX" erro={erroDe("pixTipo")}>
          <select
            name="pixTipo"
            value={pixTipo}
            onChange={(e) => {
              const novo = e.target.value as DadosBancarios["pixTipo"];
              setPixTipo(novo);
              // Conveniência: quem escolhe CPF quase sempre usa o mesmo que já
              // digitou acima. Continua editável.
              if (novo === "CPF" && !pixChave.trim()) setPixChave(cpf);
            }}
            style={entrada}
          >
            {TIPOS_CHAVE_PIX.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Chave PIX" erro={erroDe("pixChave")}>
          <input
            name="pixChave"
            value={pixChave}
            onChange={(e) => setPixChave(e.target.value)}
            placeholder={DICA_PIX[pixTipo]}
            required
            style={entrada}
          />
        </Campo>
      </div>

      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
        <div style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: "0.75rem" }}>
          Conta bancária — opcional, usada se o PIX não funcionar. Preenchendo
          uma, preencha as três.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
          <Campo rotulo="Banco" erro={erroDe("banco")}>
            <input name="banco" defaultValue={inicial?.banco ?? ""} placeholder="Ex: 341 Itaú" style={entrada} />
          </Campo>

          <Campo rotulo="Agência" erro={erroDe("agencia")}>
            <input name="agencia" defaultValue={inicial?.agencia ?? ""} placeholder="0000" style={entrada} />
          </Campo>

          <Campo rotulo="Conta com dígito" erro={erroDe("conta")}>
            <input name="conta" defaultValue={inicial?.conta ?? ""} placeholder="12345-6" style={entrada} />
          </Campo>

          <Campo rotulo="Tipo da conta" erro={erroDe("tipoConta")}>
            <select name="tipoConta" defaultValue={inicial?.tipoConta ?? ""} style={entrada}>
              <option value="">—</option>
              {TIPOS_CONTA.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={salvando}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {salvando ? "Salvando..." : modo === "primeiro-acesso" ? "Salvar e entrar" : "Salvar"}
      </button>
    </form>
  );
}

const DICA_PIX: Record<string, string> = {
  CPF: "000.000.000-00",
  CNPJ: "00.000.000/0000-00",
  EMAIL: "voce@exemplo.com.br",
  TELEFONE: "(11) 91234-5678",
  ALEATORIA: "chave fornecida pelo banco",
};

const entrada: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.625rem",
  backgroundColor: "var(--color-surface-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "2px",
  color: "var(--color-text)",
  fontSize: "0.875rem",
};

function Campo({
  rotulo,
  erro,
  children,
}: {
  rotulo: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <span style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>{rotulo}</span>
      {children}
      {erro && <span style={{ fontSize: "0.7rem", color: "var(--color-danger)" }}>{erro}</span>}
    </label>
  );
}
