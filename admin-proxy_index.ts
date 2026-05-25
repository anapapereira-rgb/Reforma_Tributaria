// ============================================================
//  Supabase Edge Function: admin-proxy
//  Proxy seguro para operações administrativas de usuários
//
//  Pré-requisitos:
//    Secret no Supabase:
//      SERVICE_ROLE_KEY=eyJ...  (service_role key — Project Settings → API)
//
//  Deploy:
//    supabase functions deploy admin-proxy --no-verify-jwt
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

// Verifica se o JWT pertence a um usuário autenticado válido
async function verificarUsuario(jwt: string, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        "apikey":        serviceKey,
        "Authorization": `Bearer ${jwt}`,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return err("Método não permitido.", 405);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return err("Token de autenticação ausente.", 401);

  const serviceKey  = Deno.env.get("SERVICE_ROLE_KEY") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")     || "";

  if (!serviceKey) return err("SERVICE_ROLE_KEY não configurada.", 500);

  // Valida que o chamador está autenticado
  const autenticado = await verificarUsuario(jwt, supabaseUrl, serviceKey);
  if (!autenticado) return err("Token inválido ou expirado.", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return err("Body JSON inválido."); }

  const action      = body.action as string;
  const adminBase   = `${supabaseUrl}/auth/v1/admin/users`;
  const adminHeaders = {
    "Content-Type":  "application/json",
    "apikey":        serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
  };

  // ── list_users ──────────────────────────────────────────────
  if (action === "list_users") {
    const res  = await fetch(`${adminBase}?per_page=200`, { headers: adminHeaders });
    const data = await res.json();
    if (!res.ok) return err(data.message || "Erro ao listar usuários.", res.status);
    return json(data);
  }

  // ── create_user ─────────────────────────────────────────────
  if (action === "create_user") {
    const { email, password, user_metadata } = body as {
      email: string; password: string; user_metadata?: Record<string, unknown>;
    };
    if (!email || !password) return err("email e password são obrigatórios.");
    const res = await fetch(adminBase, {
      method:  "POST",
      headers: adminHeaders,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: user_metadata || {} }),
    });
    const data = await res.json();
    if (!res.ok) return err(data.message || data.msg || "Erro ao criar usuário.", res.status);
    return json(data);
  }

  // ── reset_password ───────────────────────────────────────────
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
