// ============================================================
//  Supabase Edge Function: admin-proxy
//  Proxy seguro para operações administrativas de usuários
//
//  Pré-requisitos:
//    Secrets no Supabase:
//      ANTHROPIC_API_KEY=sk-ant-xxxx   (já existente)
//      SUPABASE_SERVICE_KEY=eyJ...     (service_role key — Project Settings → API)
//
//  Deploy:
//    supabase functions deploy admin-proxy --no-verify-jwt
//
//  Ações suportadas (campo "action" no body JSON):
//    list_users    → lista todos os usuários Auth
//    create_user   → cria novo usuário (email, password, user_metadata)
//    reset_password → redefine senha de um usuário (uid, password)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helpers ──────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

// ── Verifica se o token JWT do chamador é de um gerente ──────
// Usa a tabela auth.users via REST para checar user_metadata.perfil
async function verificarGerente(jwt: string, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        "apikey":        serviceKey,
        "Authorization": `Bearer ${jwt}`,
      },
    });
    if (!res.ok) return false;
    const user = await res.json();
    // Aceita tanto user_metadata.perfil quanto app_metadata.perfil
    const perfil = user?.user_metadata?.perfil || user?.app_metadata?.perfil || "";
    return perfil === "gerente";
  } catch {
    return false;
  }
}

// ── Handler principal ─────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return err("Método não permitido.", 405);

  // Extrai JWT do Authorization header
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return err("Token de autenticação ausente.", 401);

  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_KEY");
  const supabaseUrl  = Deno.env.get("SUPABASE_URL") || "";

  if (!serviceKey) return err("SUPABASE_SERVICE_KEY não configurada nos secrets da Edge Function.", 500);

  // Valida permissão de gerente
  const ehGerente = await verificarGerente(jwt, supabaseUrl, serviceKey);
  if (!ehGerente) return err("Acesso negado. Apenas gestores podem realizar esta operação.", 403);

  // Lê body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Body JSON inválido.");
  }

  const action = body.action as string;
  const adminBase = `${supabaseUrl}/auth/v1/admin/users`;
  const adminHeaders = {
    "Content-Type":  "application/json",
    "apikey":        serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
  };

  // ── list_users ────────────────────────────────────────────
  if (action === "list_users") {
    const res  = await fetch(`${adminBase}?per_page=200`, { headers: adminHeaders });
    const data = await res.json();
    if (!res.ok) return err(data.message || "Erro ao listar usuários.", res.status);
    return json(data);
  }

  // ── create_user ───────────────────────────────────────────
  if (action === "create_user") {
    const { email, password, user_metadata } = body as {
      email: string; password: string; user_metadata?: Record<string, unknown>;
    };
    if (!email || !password) return err("email e password são obrigatórios.");

    const res = await fetch(adminBase, {
      method:  "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,    // confirma e-mail automaticamente
        user_metadata: user_metadata || {},
      }),
    });
    const data = await res.json();
    if (!res.ok) return err(data.message || data.msg || "Erro ao criar usuário.", res.status);
    return json(data);
  }

  // ── reset_password ────────────────────────────────────────
  if (action === "reset_password") {
    const { uid, password } = body as { uid: string; password: string };
    if (!uid || !password) return err("uid e password são obrigatórios.");

    const res = await fetch(`${adminBase}/${uid}`, {
      method:  "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) return err(data.message || data.msg || "Erro ao redefinir senha.", res.status);
    return json({ ok: true, uid });
  }

  return err(`Ação desconhecida: "${action}".`);
});
