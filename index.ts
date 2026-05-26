// ============================================================
//  Supabase Edge Function: claude-proxy
//  Proxy seguro para chamadas à API do Claude (Anthropic)
//
//  Pré-requisitos:
//    Secret no Supabase: ANTHROPIC_API_KEY=sk-ant-xxxx
//    → Dashboard → Project Settings → Edge Functions → Secrets
//
//  Deploy:
//    supabase functions deploy claude-proxy --no-verify-jwt
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada nos secrets da Edge Function.");

    // Repassa o body inteiro para a API do Claude
    const body = await req.json();

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        // Necessário para uso de documentos PDF (type: "document")
        "anthropic-beta":    "pdfs-2024-09-25",
        "Content-Type":      "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    // Sempre repassa o status original da Anthropic (200, 400, 401, 529…)
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ type: "error", error: { type: "proxy_error", message } }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
