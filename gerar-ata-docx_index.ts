// ============================================================
//  Supabase Edge Function: gerar-ata-docx
//  Preenche o template .docx da ata e retorna o binário
//
//  Deploy:
//    supabase functions deploy gerar-ata-docx --no-verify-jwt
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @deno-types="https://esm.sh/jszip@3.10.1/index.d.ts"
import JSZip from "https://esm.sh/jszip@3.10.1";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helpers XML ───────────────────────────────────────────────────
function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paraTexto(texto: string, numId: string = "1", ilvl: string = "0"): string {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:ind w:left="${ilvl === "0" ? "720" : "1440"}" w:hanging="360"/><w:rPr><w:color w:val="242424"/></w:rPr></w:pPr><w:r><w:rPr><w:color w:val="242424"/></w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}

function linhaPendencia(p: { atividade?: string; responsavel?: string; prazo?: string; status?: string }, idx: number): string {
  const fill = idx % 2 === 0 ? "f3f3f3" : "ffffff";
  const cel = (v: string) =>
    `<w:tc><w:tcPr><w:shd w:fill="${fill}" w:val="clear"/></w:tcPr><w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:rPr><w:color w:val="242424"/></w:rPr></w:pPr><w:r><w:rPr><w:color w:val="242424"/></w:rPr><w:t xml:space="preserve">${esc(v)}</w:t></w:r></w:p></w:tc>`;
  return `<w:tr><w:trPr><w:cantSplit w:val="0"/></w:trPr>${cel(p.atividade || "")}${cel(p.responsavel || "")}${cel(p.prazo || "")}${cel(p.status || "Pendente")}</w:tr>`;
}

// ── Preenche o document.xml ───────────────────────────────────────
function preencherXml(xml: string, d: Record<string, unknown>): string {
  const get = (k: string) => String((d[k] as string) || "");
  const arr = (k: string): string[] => (d[k] as string[]) || [];

  // Campos simples
  xml = xml.replace("Projeto /Cliente:  [nome do cliente]", `Projeto / Cliente:  ${esc(get("cliente"))}`);
  xml = xml.replace("Consultor :  [nome do consultor]",     `Consultor:  ${esc(get("consultor"))}`);
  xml = xml.replace("Data: dd/mm/yy",                       `Data: ${esc(get("data"))}`);
  xml = xml.replace("Participantes: </w:t>",                `Participantes: ${esc(get("participantes"))}</w:t>`);
  xml = xml.replace("Status do projeto:  </w:t>",           `Status do projeto: ${esc(get("status_projeto"))}</w:t>`);

  // Seção 1 — tópicos: inserir após "Status do projeto"
  const topicos  = arr("topicos").map(t => paraTexto(t, "1", "0")).join("");
  xml = xml.replace(
    /<\/w:p>(<w:p[^>]*paraId="0000000B")/, 
    `</w:p>${topicos}<w:p w14:paraId="0000000B"`
  );

  // Seção 2 — decisões: substitui parágrafo vazio (paraId 0000000D)
  const decisoes = arr("decisoes").length
    ? arr("decisoes").map(d2 => paraTexto(d2, "1", "1")).join("")
    : paraTexto("—", "1", "1");
  xml = xml.replace(
    /<w:p [^>]*paraId="0000000D"[^>]*>[\s\S]*?<\/w:p>/,
    decisoes
  );

  // Seção 3 — pendências: substitui a linha vazia da tabela
  const pends = (d["pendencias"] as Array<Record<string, string>>) || [];
  const linhas = pends.length
    ? pends.map((p, i) => linhaPendencia(p, i)).join("")
    : linhaPendencia({ atividade: "—", responsavel: "—", prazo: "—", status: "—" }, 0);

  // Substitui linha vazia (paraId 00000013..00000016)
  xml = xml.replace(
    /<w:tr><w:trPr><w:cantSplit[^>]*\/><w:trHeight[^>]*><\/w:trHeight><w:tblHeader[^>]*\/><\/w:trPr><w:tc><w:tcPr><w:shd w:fill="f3f3f3"[\s\S]*?<\/w:tr>/,
    linhas
  );

  // Seção 4 — riscos: substitui parágrafo vazio (paraId 00000018)
  const riscos = arr("riscos").length
    ? arr("riscos").map(r => paraTexto(r, "2", "0")).join("")
    : paraTexto("Nenhum risco identificado.", "2", "0");
  xml = xml.replace(
    /<w:p [^>]*paraId="00000018"[^>]*>[\s\S]*?<\/w:p>/,
    riscos
  );

  // Seção 5 — próximos passos: substitui parágrafo vazio (paraId 0000001A)
  const passos = arr("proximos_passos").length
    ? arr("proximos_passos").map(p2 => paraTexto(p2, "3", "0")).join("")
    : paraTexto("—", "3", "0");
  xml = xml.replace(
    /<w:p [^>]*paraId="0000001A"[^>]*>[\s\S]*?<\/w:p>/,
    passos
  );

  return xml;
}

// ── Handler principal ─────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { dados, templateB64 } = await req.json();
    if (!dados)       throw new Error("Campo 'dados' obrigatório.");
    if (!templateB64) throw new Error("Campo 'templateB64' obrigatório.");

    // Decode template
    const templateBytes = Uint8Array.from(atob(templateB64), c => c.charCodeAt(0));

    // Abre o ZIP (docx)
    const zip = await JSZip.loadAsync(templateBytes);

    // Preenche o document.xml
    const docXml = await zip.file("word/document.xml")!.async("string");
    const docXmlPreenchido = preencherXml(docXml, dados);
    zip.file("word/document.xml", docXmlPreenchido);

    // Gera o novo docx
    const docxBytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return new Response(docxBytes, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="ata.docx"`,
      },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
