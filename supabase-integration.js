// ============================================================
//  supabase-integration.js — v4 FINAL
//  Kanban Reforma Tributária · TOTVS
// ============================================================

const SUPABASE_URL = 'https://vxeoabwqkzfdwsatuvqf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_H47gHBW02AOIdECpaPiY0A_N1Bmd6H6';

const USUARIOS = [
  { nome: 'Ana Paula', email: 'ana.papereira@totvs.com.br',        perfil: 'gerente',   consultor: '' },
  { nome: 'Ana Paula', email: 'apaulacolombo@gmail.com',           perfil: 'gerente',   consultor: '' },
  { nome: 'João',      email: 'joao.alves@totvs.com.br',           perfil: 'gerente',   consultor: '' },
  { nome: 'Kairof',      email: 'kairof.ronaldo@totvs.com.br',     perfil: 'gerente',   consultor: '' },
  { nome: 'Amanda',    email: 'amanda.pfelix@totvs.com.br',        perfil: 'consultor', consultor: 'Amanda' },
  { nome: 'Daniel',    email: 'daniel.heberle@totvs.com.br',       perfil: 'consultor', consultor: 'Daniel' },
  { nome: 'Dalva',     email: 'francidalva.desousa@totvs.com.br',  perfil: 'consultor', consultor: 'Dalva' },
  { nome: 'Erica',     email: 'acsa.eromeiro@totvs.com.br',        perfil: 'consultor', consultor: 'Erica' },
  { nome: 'Otavio',    email: 'otavio.ro.biten@totvs.com.br',      perfil: 'consultor', consultor: 'Otavio' },
  { nome: 'Thaiza',    email: 'thaiza.brugnoli@totvs.com.br',      perfil: 'consultor', consultor: 'Thaiza' },
];

let CURRENT_USER = null;
let _autoRefreshTimer = null;
const PROJECT_ID_CACHE = {};

// ── Helpers HTTP ─────────────────────────────────────────────
function sbHeaders(token) {
  return {
    'Content-Type':  'application/json',
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + (token || SUPABASE_KEY),
    'Prefer':        'return=representation'
  };
}

async function sbGet(table, query, token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders(token) });
    return res.ok ? res.json() : [];
  } catch(e) { return []; }
}

async function sbPatch(table, query, body, token) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method: 'PATCH', headers: sbHeaders(token), body: JSON.stringify(body)
    });
  } catch(e) { console.error('sbPatch error:', e); }
}

async function sbPost(table, body, token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: sbHeaders(token), body: JSON.stringify(body)
    });
    return res.ok ? res.json() : null;
  } catch(e) { return null; }
}

async function sbDelete(table, query, token) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method: 'DELETE', headers: sbHeaders(token)
    });
  } catch(e) {}
}

async function getProjectUuid(cliente, fase) {
  const chave = `${cliente}_f${fase}`;
  if (PROJECT_ID_CACHE[chave]) return PROJECT_ID_CACHE[chave];
  const rows = await sbGet('projects',
    `cliente=eq.${encodeURIComponent(cliente)}&fase=eq.${fase}&select=id`,
    CURRENT_USER?.access_token
  );
  if (rows && rows[0]) { PROJECT_ID_CACHE[chave] = rows[0].id; return rows[0].id; }
  return null;
}

function toIso(str) {
  if (!str) return null;
  if (str.includes('-')) return str;
  const [d, m, y] = str.split('/');
  return (d && m && y) ? `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` : null;
}

// ============================================================
//  SALVAR PROJETO NO SUPABASE
//  Chamada diretamente pelas funções do index.html
// ============================================================
async function salvarProjetoNoSupabase(p) {
  if (!CURRENT_USER?.access_token) return;

  // Guard de autorização: consultor só pode salvar projetos atribuídos a ele.
  // Mesmo que alguém manipule o DOM, esta verificação bloqueia o PATCH.
  if (CURRENT_USER.perfil === 'consultor' && CURRENT_USER.consultor) {
    if (p.cons !== CURRENT_USER.consultor) {
      console.warn(`[auth] Consultor "${CURRENT_USER.consultor}" tentou salvar projeto de "${p.cons}". Bloqueado.`);
      return;
    }
  }

  showSyncIndicator();
  const token = CURRENT_USER.access_token;
  const fase  = RAW.f1.includes(p) ? 1 : RAW.f2.includes(p) ? 2 : 3;
  const uuid  = p._uuid || await getProjectUuid(p.c, fase);
  if (!uuid) { console.warn('UUID não encontrado para', p.c); return; }

  await sbPatch('projects', `id=eq.${uuid}`, {
    consultor:p.cons||'', pacote:p.pkg||'P', status:p.st||'',
    prazo:p.prazo||'', atividade_atual:p.atv||'', responsavel_tarefa:p.blk||'',
    suporte:p.sus||'',
    act_ambiente:(p.acts||{}).amb||'', act_acesso:(p.acts||{}).ac||'',
    act_planilha:(p.acts||{}).pl||'', act_hmg:(p.acts||{}).hmg||'',
    act_validacao:(p.acts||{}).val||'', act_prd:(p.acts||{}).prd||'',
    act_dif:(p.acts||{}).dif||'', act_nfse:(p.acts||{}).nfse||'',
    ultima_atualizacao:p.upd||'', updated_at:new Date().toISOString()
  }, token);

  const tasksObj  = fase===1 ? (p.tasks||{}) : fase===2 ? (p.tasks2||{}) : (p.tasks3||{});
  const listaBase = fase===1 ? F1_TASKS : fase===2 ? F2_TASKS : [];
  let idx=0;
  for (const [key, td] of Object.entries(tasksObj)) {
    const isCustom = key.startsWith('cx_')||key.startsWith('cx2_');
    const base  = listaBase.find(t=>t.k===key);
    const label = isCustom?(td._label||key):(base?base.label:key);
    const ex = await sbGet('tasks',`project_id=eq.${uuid}&task_key=eq.${key}&select=id`,token);
    if (ex&&ex[0]) {
      await sbPatch('tasks',`id=eq.${ex[0].id}`,{
        status:td.status||'', responsavel:td.resp||'',
        data_conclusao:toIso(td.date)||null, updated_at:new Date().toISOString()
      },token);
    } else {
      await sbPost('tasks',{
        project_id:uuid, task_key:key, label, is_custom:isCustom,
        status:td.status||'', responsavel:td.resp||'',
        data_conclusao:toIso(td.date)||null, ordem:++idx
      },token);
    }
    idx++;
  }
  console.log('✅ Salvo no Supabase:', p.c);
}

// ============================================================
//  SALVAR HISTÓRICO NO SUPABASE
//  Insere apenas a entrada mais recente (não apaga as anteriores)
// ============================================================
async function salvarHistoricoNoSupabase(h, projId, proj) {
  if (!CURRENT_USER?.access_token || !proj) return;

  // Guard: consultor só registra histórico nos próprios projetos
  if (CURRENT_USER.perfil === 'consultor' && CURRENT_USER.consultor) {
    if (proj.cons !== CURRENT_USER.consultor) {
      console.warn(`[auth] Histórico bloqueado: "${CURRENT_USER.consultor}" não é dono de "${proj.c}".`);
      return;
    }
  }
  const token = CURRENT_USER.access_token;
  const fase  = RAW.f1.includes(proj) ? 1 : 2;
  const uuid  = proj._uuid || await getProjectUuid(proj.c, fase);
  if (!uuid) return;

  const entries = h[projId] || [];
  if (entries.length === 0) return;

  // Insere apenas a última entrada adicionada (a mais recente)
  const ultima = entries[entries.length - 1];
  // Se já tem id do Supabase, não insere novamente
  if (ultima.id && ultima.id.includes('-')) return;

  await sbPost('history', {
    project_id:   uuid,
    data_registro: ultima.date || new Date().toISOString().split('T')[0],
    descricao:    ultima.text || '',
    autor:        CURRENT_USER?.nome || ''
  }, token);
}

// ============================================================
//  SALVAR INFORMAÇÕES DO CLIENTE NO SUPABASE (client_info)
//  Todos os campos salvos em colunas individuais
// ============================================================
async function salvarClienteInfoNoSupabase(proj, data) {
  if (!CURRENT_USER?.access_token || !proj) return;

  // Guard: consultor só edita client_info de seus próprios projetos
  if (CURRENT_USER.perfil === 'consultor' && CURRENT_USER.consultor) {
    if (proj.cons !== CURRENT_USER.consultor) {
      console.warn(`[auth] client_info bloqueado: "${CURRENT_USER.consultor}" não é dono de "${proj.c}".`);
      return;
    }
  }
  const token = CURRENT_USER.access_token;

  showSyncIndicator();

  const payload = {
    contato_nome:     data.contatoFiscal || '',
    contato_telefone: data.contatoTI     || '',
    email_fiscal:     data.emailFiscal   || '',
    email_ti:         data.emailTI       || '',
    versao_sistema:   (data.versoes || []).join(', '),
    tipo_acesso:      data.acesso        || '',
    data_inicio_f2:   data.dataInicio    || '',
    hmg_link:         data.hmgLink       || '',
    hmg_user:         data.hmgUser       || '',
    hmg_pass:         data.hmgPass       || '',
    prd_link:         data.prdLink       || '',
    prd_user:         data.prdUser       || '',
    prd_pass:         data.prdPass       || '',
    codigo_fluig:     data.codigoFluig   || '',
    esn:              data.esn           || '',
    acessos_obs:      data.acessosObs    || '',
    updated_at:       new Date().toISOString()
  };

  // Busca os projetos das três fases para o mesmo cliente
  const projF1 = RAW.f1.find(p => p.c === proj.c);
  const projF2 = RAW.f2.find(p => p.c === proj.c);
  const projF3 = (RAW.f3||[]).find(p => p.c === proj.c);

  const uuids = [];
  if (projF1) {
    const u = projF1._uuid || await getProjectUuid(projF1.c, 1);
    if (u) uuids.push(u);
  }
  if (projF2) {
    const u = projF2._uuid || await getProjectUuid(projF2.c, 2);
    if (u) uuids.push(u);
  }
  if (projF3) {
    const u = projF3._uuid || await getProjectUuid(projF3.c, 3);
    if (u) uuids.push(u);
  }

  // Se não encontrou nenhum, tenta pelo projeto atual
  if (uuids.length === 0) {
    const fase = RAW.f1.includes(proj) ? 1 : 2;
    const u = proj._uuid || await getProjectUuid(proj.c, fase);
    if (u) uuids.push(u);
  }

  // Salva em todas as fases encontradas
  for (const uuid of uuids) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/client_info?project_id=eq.${uuid}`, {
      method: 'PATCH',
      headers: sbHeaders(token),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error('Erro ao salvar client_info:', await res.text());
    } else {
      console.log('Informações do cliente salvas (fase uuid:', uuid + '):', proj.c);
    }
  }
}

// ============================================================
//  TELA DE LOGIN
// ============================================================
function mostrarTelaLogin(erro) {
  document.body.style.overflow = 'hidden';
  let el = document.getElementById('login-screen');
  if (!el) { el = document.createElement('div'); el.id = 'login-screen'; document.body.appendChild(el); }

  el.innerHTML = `
    <style>
      #login-screen{position:fixed;inset:0;z-index:99999;
        background:linear-gradient(135deg,#081420 0%,#0a1e30 50%,#081420 100%);
        display:flex;align-items:center;justify-content:center;font-family:'Inter',sans-serif;}
      .lb{background:#0d1f30;border:1px solid #1e3d5c;border-radius:16px;padding:40px 36px;
        width:100%;max-width:400px;box-shadow:0 24px 80px rgba(0,0,0,.6);animation:lbFade .3s ease;}
      @keyframes lbFade{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
      .lb-logo{display:flex;align-items:center;gap:12px;margin-bottom:28px;justify-content:center;}
      .lb-logo-title{font-size:15px;font-weight:700;color:#e8f4fd;}
      .lb-logo-sub{font-size:11px;color:#00c4cc;font-weight:500;letter-spacing:.05em;text-transform:uppercase;}
      .lb-title{font-size:20px;font-weight:800;color:#e8f4fd;margin-bottom:6px;text-align:center;}
      .lb-sub{font-size:12px;color:#7aadcc;text-align:center;margin-bottom:28px;}
      .lb-field{display:flex;flex-direction:column;gap:6px;margin-bottom:16px;}
      .lb-field label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7aadcc;}
      .lb-field input{background:#112840;border:1px solid #1e3d5c;border-radius:8px;padding:10px 14px;
        color:#e8f4fd;font-size:14px;font-family:'Inter',sans-serif;outline:none;
        transition:border-color .15s;width:100%;box-sizing:border-box;}
      .lb-field input:focus{border-color:#00c4cc;}
      .lb-btn{width:100%;padding:12px;border:none;border-radius:8px;
        background:linear-gradient(135deg,#00c4cc,#0088ff);color:#fff;font-size:14px;
        font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;transition:opacity .15s;margin-top:8px;}
      .lb-btn:hover{opacity:.88;} .lb-btn:disabled{opacity:.5;cursor:not-allowed;}
      .lb-err{background:#ef444422;border:1px solid #ef444444;border-radius:8px;padding:10px 14px;
        color:#f87171;font-size:12px;margin-bottom:16px;display:${erro?'block':'none'};}
      .lb-footer{text-align:center;margin-top:20px;font-size:11px;color:#7aadcc;}
    </style>
    <div class="lb">
      <div class="lb-logo">
        <svg viewBox="0 0 36 36" fill="none" style="height:32px;width:32px;">
          <path d="M18 2L32 10V26L18 34L4 26V10L18 2Z" fill="#00c4cc" opacity=".9"/>
          <path d="M18 7L28 13V25L18 31L8 25V13L18 7Z" fill="#081420"/>
          <path d="M18 11L24 14.5V21.5L18 25L12 21.5V14.5L18 11Z" fill="#00c4cc" opacity=".5"/>
        </svg>
        <div>
          <div class="lb-logo-title">Reforma Tributária</div>
          <div class="lb-logo-sub">Gerenciamento de Projetos · TOTVS</div>
        </div>
      </div>
      <div class="lb-title">Bem-vindo</div>
      <div class="lb-sub">Acesse com seu e-mail corporativo</div>
      <div class="lb-err" id="lb-err">${erro||''}</div>
      <div class="lb-field">
        <label>E-mail</label>
        <input type="email" id="lb-email" placeholder="seu@totvs.com.br" autocomplete="email"/>
      </div>
      <div class="lb-field">
        <label>Senha</label>
        <input type="password" id="lb-senha" placeholder="••••••••" autocomplete="current-password"/>
      </div>
      <button class="lb-btn" id="lb-btn" onclick="fazerLogin()">Entrar</button>
      <div class="lb-footer">Acesso restrito a usuários autorizados</div>
    </div>
  `;
  el.querySelector('#lb-senha').addEventListener('keydown', e => { if(e.key==='Enter') fazerLogin(); });
  el.querySelector('#lb-email').addEventListener('keydown', e => { if(e.key==='Enter') el.querySelector('#lb-senha').focus(); });
  setTimeout(() => el.querySelector('#lb-email')?.focus(), 150);
}

// ============================================================
//  TELA DE TROCA DE SENHA
// ============================================================
function mostrarTrocaSenha() {
  const el = document.getElementById('login-screen');
  el.innerHTML = `
    <style>
      #login-screen{position:fixed;inset:0;z-index:99999;
        background:linear-gradient(135deg,#081420 0%,#0a1e30 50%,#081420 100%);
        display:flex;align-items:center;justify-content:center;font-family:'Inter',sans-serif;}
      .lb{background:#0d1f30;border:1px solid #1e3d5c;border-radius:16px;padding:40px 36px;
        width:100%;max-width:400px;box-shadow:0 24px 80px rgba(0,0,0,.6);}
      .lb-title{font-size:20px;font-weight:800;color:#e8f4fd;margin-bottom:6px;text-align:center;}
      .lb-sub{font-size:12px;color:#7aadcc;text-align:center;margin-bottom:20px;line-height:1.6;}
      .lb-aviso{background:#f59e0b22;border:1px solid #f59e0b44;border-radius:8px;
        padding:12px 14px;color:#fbbf24;font-size:12px;margin-bottom:20px;line-height:1.6;}
      .lb-field{display:flex;flex-direction:column;gap:6px;margin-bottom:16px;}
      .lb-field label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7aadcc;}
      .lb-field input{background:#112840;border:1px solid #1e3d5c;border-radius:8px;padding:10px 14px;
        color:#e8f4fd;font-size:14px;font-family:'Inter',sans-serif;outline:none;
        transition:border-color .15s;width:100%;box-sizing:border-box;}
      .lb-field input:focus{border-color:#00c4cc;}
      .lb-btn{width:100%;padding:12px;border:none;border-radius:8px;
        background:linear-gradient(135deg,#00c4cc,#0088ff);color:#fff;font-size:14px;
        font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;transition:opacity .15s;margin-top:8px;}
      .lb-btn:hover{opacity:.88;}
      .lb-err{background:#ef444422;border:1px solid #ef444444;border-radius:8px;padding:10px 14px;
        color:#f87171;font-size:12px;margin-bottom:16px;display:none;}
    </style>
    <div class="lb">
      <div class="lb-title">Crie sua senha</div>
      <div class="lb-sub">Primeiro acesso detectado.<br>Defina uma nova senha para continuar.</div>
      <div class="lb-aviso">A senha padrao Mudar@123 deve ser substituida agora.<br>Use pelo menos 8 caracteres.</div>
      <div class="lb-err" id="lb-err"></div>
      <div class="lb-field"><label>Nova senha</label><input type="password" id="nova-senha" placeholder="Minimo 8 caracteres"/></div>
      <div class="lb-field"><label>Confirmar senha</label><input type="password" id="conf-senha" placeholder="Repita a senha"/></div>
      <button class="lb-btn" onclick="trocarSenha()">Salvar e entrar</button>
    </div>
  `;
}

// ============================================================
//  AUTENTICAÇÃO
// ============================================================
async function fazerLogin() {
  const email = document.getElementById('lb-email').value.trim().toLowerCase();
  const senha  = document.getElementById('lb-senha').value;
  const btn    = document.getElementById('lb-btn');
  const errEl  = document.getElementById('lb-err');

  if (!email || !senha) { errEl.textContent='Preencha e-mail e senha.'; errEl.style.display='block'; return; }

  const usuarioLocal = USUARIOS.find(u => u.email.toLowerCase() === email);
  if (!usuarioLocal) {
    errEl.textContent='E-mail nao autorizado. Fale com o administrador.';
    errEl.style.display='block'; return;
  }

  btn.disabled=true; btn.textContent='Entrando...'; errEl.style.display='none';

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},
      body:JSON.stringify({email, password:senha})
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent='E-mail ou senha incorretos.';
      errEl.style.display='block'; btn.disabled=false; btn.textContent='Entrar'; return;
    }

    CURRENT_USER = { ...usuarioLocal, access_token:data.access_token, refresh_token:data.refresh_token, uid:data.user?.id };
    sessionStorage.setItem('kanban_session', JSON.stringify(CURRENT_USER));

    if (senha === 'Mudar@123') { mostrarTrocaSenha(); return; }
    await iniciarApp();

  } catch(e) {
    errEl.textContent='Erro de conexao. Verifique sua internet.';
    errEl.style.display='block'; btn.disabled=false; btn.textContent='Entrar';
  }
}

async function trocarSenha() {
  const nova=document.getElementById('nova-senha').value;
  const conf=document.getElementById('conf-senha').value;
  const errEl=document.getElementById('lb-err');
  if (nova.length<8){errEl.textContent='Minimo 8 caracteres.';errEl.style.display='block';return;}
  if (nova!==conf){errEl.textContent='As senhas nao coincidem.';errEl.style.display='block';return;}
  errEl.style.display='none';
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`,{
    method:'PUT',
    headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':'Bearer '+CURRENT_USER.access_token},
    body:JSON.stringify({password:nova})
  });
  if (!res.ok){errEl.textContent='Erro ao salvar. Tente novamente.';errEl.style.display='block';return;}
  await iniciarApp();
}

function fazerLogout() {
  clearInterval(_autoRefreshTimer);
  sessionStorage.removeItem('kanban_session');
  CURRENT_USER=null;
  location.reload();
}

// ============================================================
//  INICIAR APP
// ============================================================
async function iniciarApp() {
  const loginEl = document.getElementById('login-screen');
  if (loginEl) loginEl.remove();
  document.body.style.overflow='';
  atualizarTopbar();
  await carregarDadosDoSupabase();
  // Após carregar os projetos (que populam RAW e _uuid), sincroniza
  // qualquer documento que ficou pendente no IndexedDB durante uso offline.
  sincronizarDocsPendentes();
  iniciarAutoRefresh();
  adicionarBotaoRefresh();
}

// ============================================================
//  SYNC AUTOMÁTICO DE DOCUMENTOS OFFLINE → SUPABASE
//
//  Fluxo:
//   1. Varre TODAS as chaves do IndexedDB que começam com "kanban_docs_".
//   2. Para cada projeto com docs pendentes (sem sbId = nunca enviados),
//      tenta fazer upload para o Supabase Storage + inserir metadados.
//   3. Ao confirmar o upload, substitui o item local com {sbId, url}
//      e remove o Blob da memória (libera espaço no IndexedDB).
//   4. Exibe um toast discreto informando quantos docs foram sincronizados.
//   5. Erros por arquivo são ignorados silenciosamente (tenta no próximo login).
// ============================================================
async function sincronizarDocsPendentes() {
  if (!CURRENT_USER?.access_token) return;

  // localForage pode ainda não estar disponível (race condition improvável mas possível)
  if (typeof localforage === 'undefined') return;

  const forage = typeof _getDocForage === 'function' ? _getDocForage() : null;
  if (!forage) return;

  const token = CURRENT_USER.access_token;
  let totalSincronizados = 0;
  let totalErros = 0;

  try {
    // Lista todas as chaves do object store 'docs'
    const todasChaves = await forage.keys();
    const chavesDoc   = todasChaves.filter(k => k.startsWith('kanban_docs_'));

    if (chavesDoc.length === 0) return; // nada pendente

    console.info(`[sync] ${chavesDoc.length} chave(s) no IndexedDB. Verificando pendências...`);

    for (const chave of chavesDoc) {
      // Extrai o projectId da chave: "kanban_docs_<pid>"
      const pid = chave.replace('kanban_docs_', '');

      let docs;
      try { docs = await forage.getItem(chave); } catch(e) { continue; }
      if (!Array.isArray(docs) || docs.length === 0) continue;

      // Filtra apenas os docs sem sbId (= nunca enviados ao Supabase)
      const pendentes = docs.filter(d => !d.sbId && d.blob instanceof Blob);
      if (pendentes.length === 0) continue;

      // Descobre o UUID do projeto pelo projectId (formato "cliente|consultor")
      // Tenta primeiro pelo cache, depois pelos arrays RAW já carregados
      const uuid = _resolverUuidPorPid(pid);
      if (!uuid) {
        console.warn(`[sync] UUID não encontrado para pid="${pid}". Ficará pendente.`);
        continue;
      }

      const today   = new Date();
      const dataFmt = String(today.getDate()).padStart(2,'0') + '/' +
                      String(today.getMonth()+1).padStart(2,'0') + '/' +
                      today.getFullYear();

      for (const doc of pendentes) {
        try {
          const _san = n => n.normalize('NFD')
            .replace(/[\u0300-\u036f]/g,'')
            .replace(/[[\](){}]/g,'')
            .replace(/[^a-zA-Z0-9._-]/g,'_')
            .replace(/_+/g,'_')
            .slice(0,100);

          const safeName    = _san(doc.name || 'documento.pdf');
          const storagePath = `${uuid}/${Date.now()}_${safeName}`;

          // 1. Upload do Blob para o Supabase Storage
          const upRes = await fetch(
            `${SUPABASE_URL}/storage/v1/object/kanban-documents/${storagePath}`,
            {
              method:  'POST',
              headers: {
                'apikey':        SUPABASE_KEY,
                'Authorization': 'Bearer ' + token,
                'Content-Type':  doc.blob.type || 'application/pdf',
                'x-upsert':      'true',
              },
              body: doc.blob,
            }
          );

          if (!upRes.ok) {
            const err = await upRes.text();
            console.warn(`[sync] Upload falhou para "${doc.name}":`, err);
            totalErros++;
            continue;
          }

          // 2. Persiste metadados na tabela documents
          const metaRes = await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
            method:  'POST',
            headers: {
              'Content-Type':  'application/json',
              'apikey':        SUPABASE_KEY,
              'Authorization': 'Bearer ' + token,
              'Prefer':        'return=representation',
            },
            body: JSON.stringify({
              project_id:    uuid,
              nome_arquivo:  doc.name,
              tamanho:       doc.size || '',
              tamanho_bytes: doc.blob.size,
              data_upload:   doc.date || dataFmt,
              storage_path:  storagePath,
              mime_type:     doc.blob.type || 'application/pdf',
              uploaded_by:   CURRENT_USER.nome || '',
            }),
          });

          if (!metaRes.ok) {
            console.warn(`[sync] Metadata falhou para "${doc.name}":`, await metaRes.text());
            totalErros++;
            continue;
          }

          const metaData = await metaRes.json();
          const sbId     = (Array.isArray(metaData) ? metaData[0] : metaData)?.id || null;

          // 3. Substitui o item local: troca Blob pesado por referência leve (sbId + url)
          doc.sbId       = sbId;
          doc.url        = `${SUPABASE_URL}/storage/v1/object/public/kanban-documents/${storagePath}`;
          doc.blob       = null;      // libera Blob do IndexedDB
          doc.objectURL  = undefined; // invalida objectURL antigo
          totalSincronizados++;
          console.info(`[sync] ✅ "${doc.name}" enviado para o Supabase (projeto ${pid}).`);

        } catch(errDoc) {
          console.warn(`[sync] Erro ao sincronizar "${doc.name}":`, errDoc);
          totalErros++;
        }
      }

      // 4. Persiste a lista atualizada no IndexedDB (Blobs removidos, sbIds adicionados)
      try { await forage.setItem(chave, docs); } catch(e) { /* ignora */ }
    }

  } catch(e) {
    console.error('[sync] Erro geral na sincronização de docs:', e);
    return;
  }

  // 5. Feedback visual
  if (totalSincronizados > 0) {
    const msg = totalSincronizados === 1
      ? '☁️ 1 documento offline sincronizado com o servidor!'
      : `☁️ ${totalSincronizados} documentos offline sincronizados com o servidor!`;
    const extra = totalErros > 0 ? ` (${totalErros} falharam e serão reenviados no próximo acesso)` : '';
    const toast = document.getElementById('saveToast');
    if (toast) {
      toast.textContent = msg + extra;
      toast.style.background = 'var(--teal, #14b8a6)';
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        toast.textContent = '✓ Alterações salvas!';
        toast.style.background = '';
      }, 5000);
    }
    console.info(`[sync] Sincronização concluída: ${totalSincronizados} ok, ${totalErros} erro(s).`);
  }
}

// ── Resolve o _uuid do Supabase a partir do projectId local ──
// projectId tem o formato "cliente|consultor" (gerado pela função projectId() do index.html)
function _resolverUuidPorPid(pid) {
  // Tenta pelo cache de UUIDs (PROJECT_ID_CACHE) preenchido ao carregar os projetos
  const todosProjs = [...(RAW.f1||[]), ...(RAW.f2||[]), ...(RAW.f3||[])];
  for (const p of todosProjs) {
    // Reconstrói o pid do jeito que a função projectId() do index.html faz:
    // (p.c + '|' + (p.cons||'')).toLowerCase().replace(/\s+/g,'_')
    const candidato = (p.c + '|' + (p.cons||'')).toLowerCase().replace(/\s+/g,'_');
    if (candidato === pid && p._uuid) return p._uuid;
  }
  // Fallback: PROJECT_ID_CACHE indexado por "cliente_fN"
  for (const [key, uuid] of Object.entries(PROJECT_ID_CACHE)) {
    const [clienteRaw] = key.split('_f');
    const clienteNorm  = clienteRaw.toLowerCase().replace(/\s+/g,'_');
    if (pid.startsWith(clienteNorm)) return uuid;
  }
  return null;
}

function atualizarTopbar() {
  if (!CURRENT_USER) return;
  const badge = document.querySelector('.manager-badge');
  if (!badge) return;
  const iniciais    = CURRENT_USER.nome.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
  const cor         = CURRENT_USER.perfil==='gerente' ? 'linear-gradient(135deg,#00c4cc,#0088ff)' : 'linear-gradient(135deg,#a855f7,#6366f1)';
  const labelPerfil = CURRENT_USER.perfil==='gerente' ? 'Gerente de Projetos' : 'Consultor';
  const btnUsuarios = CURRENT_USER.perfil==='gerente'
    ? `<button onclick="abrirGerenciarUsuarios()" title="Gerenciar Usuários"
        style="background:none;border:1px solid #1e3d5c;border-radius:6px;color:#7aadcc;
        cursor:pointer;font-size:12px;margin-left:6px;padding:4px 10px;line-height:1;
        transition:all .15s;font-family:Inter,sans-serif;display:flex;align-items:center;gap:5px;"
        onmouseover="this.style.borderColor='#00c4cc';this.style.color='#00c4cc'"
        onmouseout="this.style.borderColor='#1e3d5c';this.style.color='#7aadcc'">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Usuários</button>`
    : '';
  badge.innerHTML = `
    <div class="avatar" style="background:${cor};font-size:11px;">${iniciais}</div>
    <span>${CURRENT_USER.nome} · ${labelPerfil}</span>
    ${btnUsuarios}
    <button onclick="fazerLogout()" title="Sair" style="background:none;border:none;color:#7aadcc;
      cursor:pointer;font-size:16px;margin-left:6px;padding:0;line-height:1;transition:color .15s;"
      onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#7aadcc'">&#x23FB;</button>
  `;
  // Proteção de renderização: remove botões do DOM em vez de ocultar via CSS
  if (CURRENT_USER.perfil === 'consultor' && CURRENT_USER.consultor) {
    // Aguarda o DOM estabilizar após render() e aplica restrição
    requestAnimationFrame(() => _aplicarRestricaoConsultor());
  }
}

// ── Remove elementos administrativos do DOM para consultores ──
// Chamada após cada render() — impede ressurreição de elementos via DOM inspector.
function _aplicarRestricaoConsultor() {
  if (!CURRENT_USER || CURRENT_USER.perfil !== 'consultor') return;
  const meuNome = CURRENT_USER.consultor.toLowerCase();

  // Botões de filtro de consultor na sidebar (sb-cons-*)
  document.querySelectorAll('[id^="sb-cons-"]').forEach(btn => {
    if (btn.id === 'sb-cons-all') return;
    if (!btn.id.toLowerCase().includes(meuNome)) btn.remove();
  });

  // Botões de filtro inline no board (cons-btn)
  document.querySelectorAll('.cons-btn').forEach(btn => {
    const t = btn.textContent.trim();
    if (t !== 'Todos' && !t.toLowerCase().includes(meuNome)) btn.remove();
  });

  // Botões e ações exclusivas de gerentes
  document.querySelectorAll('.btn-novo-projeto, .admin-action').forEach(el => el.remove());
}

// ============================================================
//  GERENCIAMENTO DE USUÁRIOS — estado interno
// ============================================================
// URL da Edge Function de proxy admin (deploy separado, veja admin-proxy/index.ts)
const ADMIN_PROXY_URL = `${SUPABASE_URL}/functions/v1/admin-proxy`;

// Cache dos usuários Auth carregados do Supabase (enriquecidos com dados locais)
let _guUsuariosAuth = [];

// Cores fixas por índice para avatares
const _GU_CORES = ['#6366f1','#14b8a6','#f59e0b','#ec4899','#22c55e','#a855f7','#3b82f6','#ef4444','#00c4cc','#f97316'];

// ── Chama a Edge Function admin-proxy ────────────────────────
async function _adminCall(action, payload = {}) {
  const res = await fetch(ADMIN_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + CURRENT_USER.access_token,
      'apikey':        SUPABASE_KEY
    },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || `Erro HTTP ${res.status}`);
  return data;
}

// ── Mescla lista Auth com metadados locais (USUARIOS) ────────
function _guEnriquecer(authUsers) {
  return authUsers.map((au, i) => {
    const local = USUARIOS.find(u => u.email.toLowerCase() === au.email.toLowerCase());
    return {
      uid:       au.id,
      email:     au.email,
      nome:      local?.nome      || au.user_metadata?.nome || au.email.split('@')[0],
      perfil:    local?.perfil    || au.user_metadata?.perfil    || 'consultor',
      consultor: local?.consultor || au.user_metadata?.consultor || '',
      cor:       _GU_CORES[i % _GU_CORES.length],
      ultimo_login: au.last_sign_in_at || null,
      criado_em:    au.created_at      || null,
    };
  });
}

// ============================================================
//  ABRIR MODAL GERENCIAR USUÁRIOS
// ============================================================
function abrirGerenciarUsuarios() {
  if (!CURRENT_USER || CURRENT_USER.perfil !== 'gerente') return;

  // Remove overlay anterior se existir
  document.getElementById('gu-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'gu-overlay';
  overlay.innerHTML = `
  <style>
    #gu-overlay{
      position:fixed;inset:0;z-index:9999;
      background:rgba(8,20,32,.88);
      display:flex;align-items:center;justify-content:center;
      font-family:'Inter',system-ui,sans-serif;
      backdrop-filter:blur(6px);
      padding:16px;
    }
    #gu-modal{
      background:#0d1f30;border:1px solid #1e3d5c;border-radius:18px;
      width:100%;max-width:740px;max-height:92vh;
      display:flex;flex-direction:column;
      box-shadow:0 32px 80px rgba(0,0,0,.75);
      animation:guSlide .22s cubic-bezier(.22,1,.36,1);
      overflow:hidden;
    }
    @keyframes guSlide{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}

    /* ── Cabeçalho ── */
    .gu-head{
      padding:22px 28px 18px;border-bottom:1px solid #1e3d5c;
      display:flex;align-items:center;gap:14px;flex-shrink:0;
    }
    .gu-head-icon{
      width:40px;height:40px;border-radius:10px;flex-shrink:0;
      background:linear-gradient(135deg,#00c4cc22,#0088ff22);
      border:1px solid #00c4cc44;
      display:flex;align-items:center;justify-content:center;
    }
    .gu-head h2{font-size:17px;font-weight:800;color:#e8f4fd;margin:0;}
    .gu-head p{font-size:12px;color:#7aadcc;margin:2px 0 0;}
    .gu-head-close{
      margin-left:auto;background:none;border:none;color:#7aadcc;
      cursor:pointer;font-size:20px;padding:4px;line-height:1;
      transition:color .15s;border-radius:6px;
    }
    .gu-head-close:hover{color:#e8f4fd;}

    /* ── Tabs ── */
    .gu-tabs{
      display:flex;border-bottom:1px solid #1e3d5c;
      flex-shrink:0;background:#081420;
    }
    .gu-tab{
      padding:12px 22px;font-size:13px;font-weight:600;color:#7aadcc;
      background:none;border:none;border-bottom:3px solid transparent;
      cursor:pointer;transition:all .15s;font-family:inherit;
      display:flex;align-items:center;gap:7px;
    }
    .gu-tab.active{color:#00c4cc;border-bottom-color:#00c4cc;background:#00c4cc08;}
    .gu-tab-count{
      background:#1e3d5c;border-radius:10px;padding:1px 7px;
      font-size:11px;font-weight:700;
    }
    .gu-tab.active .gu-tab-count{background:#00c4cc;color:#081420;}

    /* ── Corpo scrollável ── */
    .gu-body{flex:1;overflow-y:auto;padding:20px 28px 28px;}
    .gu-body::-webkit-scrollbar{width:5px;}
    .gu-body::-webkit-scrollbar-track{background:transparent;}
    .gu-body::-webkit-scrollbar-thumb{background:#1e3d5c;border-radius:3px;}

    /* ── Painel ── */
    .gu-panel{display:none;}
    .gu-panel.active{display:block;}

    /* ── Busca ── */
    .gu-search-wrap{position:relative;margin-bottom:14px;}
    .gu-search{
      width:100%;box-sizing:border-box;
      background:#112840;border:1px solid #1e3d5c;border-radius:8px;
      padding:9px 12px 9px 34px;color:#e8f4fd;font-size:13px;
      font-family:inherit;outline:none;transition:border-color .15s;
    }
    .gu-search:focus{border-color:#00c4cc;}
    .gu-search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#7aadcc;pointer-events:none;}

    /* ── Loading ── */
    .gu-loading{
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:40px;gap:12px;color:#7aadcc;font-size:13px;
    }
    .gu-spin{
      width:32px;height:32px;border:3px solid #1e3d5c;
      border-top-color:#00c4cc;border-radius:50%;
      animation:guSpin .7s linear infinite;
    }
    @keyframes guSpin{to{transform:rotate(360deg)}}

    /* ── Lista de usuários ── */
    #gu-user-list{}
    .gu-user-row{
      display:flex;align-items:center;gap:12px;
      padding:11px 14px;border-radius:10px;
      background:#112840;border:1px solid #1e3d5c;
      margin-bottom:8px;transition:border-color .15s;
    }
    .gu-user-row:hover{border-color:#2a5278;}
    .gu-av{
      width:36px;height:36px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:13px;font-weight:700;color:#fff;flex-shrink:0;
    }
    .gu-info{flex:1;min-width:0;}
    .gu-name{font-size:13px;font-weight:600;color:#e8f4fd;margin-bottom:2px;}
    .gu-email{font-size:11px;color:#7aadcc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .gu-meta{font-size:10px;color:#4a7a99;margin-top:1px;}
    .gu-chip{
      font-size:10px;font-weight:700;padding:2px 9px;border-radius:10px;flex-shrink:0;
    }
    .gu-chip-g{background:#00c4cc18;color:#00c4cc;border:1px solid #00c4cc33;}
    .gu-chip-c{background:#a855f718;color:#a855f7;border:1px solid #a855f733;}
    .gu-row-actions{display:flex;gap:6px;flex-shrink:0;}
    .gu-btn-act{
      background:none;border:1px solid #1e3d5c;border-radius:6px;
      color:#7aadcc;cursor:pointer;font-size:11px;padding:5px 10px;
      transition:all .15s;font-family:inherit;white-space:nowrap;
      display:flex;align-items:center;gap:5px;
    }
    .gu-btn-act:hover{border-color:#f59e0b;color:#f59e0b;}
    .gu-btn-act:disabled{opacity:.45;cursor:not-allowed;}
    .gu-empty{text-align:center;padding:32px;color:#4a7a99;font-size:13px;}

    /* ── Formulário ── */
    .gu-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
    .gu-field{display:flex;flex-direction:column;gap:6px;}
    .gu-field.span2{grid-column:1/-1;}
    .gu-field label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7aadcc;}
    .gu-field input,.gu-field select{
      background:#112840;border:1px solid #1e3d5c;border-radius:8px;
      padding:10px 13px;color:#e8f4fd;font-size:13px;font-family:inherit;
      outline:none;transition:border-color .15s;width:100%;box-sizing:border-box;
    }
    .gu-field input:focus,.gu-field select:focus{border-color:#00c4cc;}
    .gu-field input.invalid{border-color:#ef4444;}
    .gu-field select option{background:#112840;}
    .gu-field-hint{font-size:10px;color:#4a7a99;margin-top:1px;}
    .gu-senha-wrap{position:relative;}
    .gu-senha-wrap input{padding-right:38px;}
    .gu-senha-eye{
      position:absolute;right:10px;top:50%;transform:translateY(-50%);
      background:none;border:none;color:#7aadcc;cursor:pointer;padding:2px;
      font-size:14px;transition:color .15s;
    }
    .gu-senha-eye:hover{color:#00c4cc;}

    /* ── Alerta de perfil ── */
    .gu-perfil-hint{
      background:#00c4cc11;border:1px solid #00c4cc33;border-radius:8px;
      padding:10px 13px;font-size:12px;color:#7aadcc;line-height:1.5;
      margin-top:2px;display:none;
    }

    /* ── Rodapé do formulário ── */
    .gu-form-footer{
      display:flex;align-items:center;justify-content:flex-end;
      gap:10px;margin-top:20px;padding-top:16px;
      border-top:1px solid #1e3d5c;
    }
    .gu-btn-secondary{
      padding:10px 20px;border:1px solid #1e3d5c;border-radius:8px;background:none;
      color:#7aadcc;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;
      transition:all .15s;
    }
    .gu-btn-secondary:hover{border-color:#2a5278;color:#e8f4fd;}
    .gu-btn-primary{
      padding:10px 24px;border:none;border-radius:8px;
      background:linear-gradient(135deg,#00c4cc,#0088ff);
      color:#fff;font-size:13px;font-weight:700;cursor:pointer;
      font-family:inherit;transition:opacity .15s;
      display:flex;align-items:center;gap:7px;
    }
    .gu-btn-primary:hover{opacity:.88;}
    .gu-btn-primary:disabled{opacity:.5;cursor:not-allowed;}

    /* ── Toast / mensagem ── */
    .gu-toast{
      padding:11px 15px;border-radius:8px;font-size:12px;
      margin-top:14px;display:none;line-height:1.5;
    }
    .gu-toast.ok{background:#22c55e18;border:1px solid #22c55e44;color:#86efac;}
    .gu-toast.err{background:#ef444418;border:1px solid #ef444444;color:#fca5a5;}
    .gu-toast.warn{background:#f59e0b18;border:1px solid #f59e0b44;color:#fcd34d;}
  </style>

  <div id="gu-modal">
    <!-- Cabeçalho -->
    <div class="gu-head">
      <div class="gu-head-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c4cc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </div>
      <div>
        <h2>Manutenção de Usuários</h2>
        <p>Gerencie acessos, perfis e senhas do sistema</p>
      </div>
      <button class="gu-head-close" onclick="document.getElementById('gu-overlay').remove()" title="Fechar">✕</button>
    </div>

    <!-- Tabs -->
    <div class="gu-tabs">
      <button class="gu-tab active" id="gu-tab-lista" onclick="guMudarTab('lista')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        Usuários cadastrados
        <span class="gu-tab-count" id="gu-count">—</span>
      </button>
      <button class="gu-tab" id="gu-tab-novo" onclick="guMudarTab('novo')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        Novo acesso
      </button>
    </div>

    <!-- Corpo -->
    <div class="gu-body">

      <!-- Painel: lista -->
      <div class="gu-panel active" id="gu-panel-lista">
        <div class="gu-search-wrap">
          <svg class="gu-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="gu-search" type="text" id="gu-busca" placeholder="Buscar por nome ou e-mail…" oninput="guFiltrarLista()"/>
        </div>
        <div id="gu-user-list">
          <div class="gu-loading">
            <div class="gu-spin"></div>
            <span>Carregando usuários…</span>
          </div>
        </div>
      </div>

      <!-- Painel: novo usuário -->
      <div class="gu-panel" id="gu-panel-novo">
        <div class="gu-form-grid">

          <div class="gu-field">
            <label>Nome completo *</label>
            <input type="text" id="gu-nome" placeholder="Ex: Carlos Silva" autocomplete="off"/>
          </div>

          <div class="gu-field">
            <label>E-mail corporativo *</label>
            <input type="email" id="gu-email" placeholder="usuario@totvs.com.br" autocomplete="off"/>
          </div>

          <div class="gu-field">
            <label>Perfil de acesso *</label>
            <select id="gu-perfil" onchange="guOnPerfilChange()">
              <option value="consultor">Consultor</option>
              <option value="gerente">Gestor de Projetos</option>
            </select>
          </div>

          <div class="gu-field" id="gu-wrap-consultor">
            <label>Apelido do consultor *</label>
            <input type="text" id="gu-consultor" placeholder="Ex: Carlos (usado no filtro do Kanban)" autocomplete="off"/>
            <span class="gu-field-hint">Deve corresponder ao nome exibido nos cards do Kanban</span>
          </div>

          <div class="gu-field span2" id="gu-hint-gerente" style="display:none;">
            <div class="gu-perfil-hint" style="display:block;">
              ℹ️ Gestores têm acesso total ao sistema: todos os projetos, todas as fases, painel de usuários e configurações.
            </div>
          </div>

          <div class="gu-field span2">
            <label>Senha inicial *</label>
            <div class="gu-senha-wrap">
              <input type="text" id="gu-senha" value="Mudar@123" autocomplete="new-password"/>
              <button class="gu-senha-eye" type="button" onclick="guToggleSenha(this)" title="Mostrar/ocultar">👁</button>
            </div>
            <span class="gu-field-hint">O usuário deverá alterar a senha no primeiro acesso</span>
          </div>

        </div>

        <div class="gu-toast" id="gu-toast-novo"></div>

        <div class="gu-form-footer">
          <button class="gu-btn-secondary" onclick="guLimparForm()">Limpar campos</button>
          <button class="gu-btn-primary" id="gu-btn-criar" onclick="guCriarUsuario()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Criar acesso
          </button>
        </div>
      </div>

    </div><!-- /gu-body -->
  </div><!-- /gu-modal -->
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) document.getElementById('gu-overlay').remove(); });

  // Carregar usuários imediatamente
  guCarregarUsuarios();
}

// ── Navegação entre tabs ──────────────────────────────────────
function guMudarTab(tab) {
  document.querySelectorAll('.gu-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.gu-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`gu-tab-${tab}`).classList.add('active');
  document.getElementById(`gu-panel-${tab}`).classList.add('active');
}

// ── Carregar usuários do Supabase Auth via admin-proxy ────────
async function guCarregarUsuarios() {
  const list = document.getElementById('gu-user-list');
  if (!list) return;
  list.innerHTML = '<div class="gu-loading"><div class="gu-spin"></div><span>Buscando usuários…</span></div>';

  try {
    const data = await _adminCall('list_users');
    _guUsuariosAuth = _guEnriquecer(data.users || []);
    guRenderLista(_guUsuariosAuth);
    const cnt = document.getElementById('gu-count');
    if (cnt) cnt.textContent = _guUsuariosAuth.length;
  } catch(e) {
    console.warn('admin-proxy indisponível, usando lista local:', e.message);
    // Fallback: usa a lista local USUARIOS
    _guUsuariosAuth = USUARIOS.map((u, i) => ({
      uid: null, email: u.email, nome: u.nome,
      perfil: u.perfil, consultor: u.consultor,
      cor: _GU_CORES[i % _GU_CORES.length],
      ultimo_login: null, criado_em: null
    }));
    guRenderLista(_guUsuariosAuth);
    const cnt = document.getElementById('gu-count');
    if (cnt) cnt.textContent = _guUsuariosAuth.length;
  }
}

// ── Renderizar lista (recebe array já filtrado) ───────────────
function guRenderLista(lista) {
  const el = document.getElementById('gu-user-list');
  if (!el) return;

  if (!lista || lista.length === 0) {
    el.innerHTML = '<div class="gu-empty">Nenhum usuário encontrado.</div>';
    return;
  }

  // Ordena: gerentes primeiro, depois por nome
  const ordenados = [...lista].sort((a, b) => {
    if (a.perfil === b.perfil) return a.nome.localeCompare(b.nome, 'pt-BR');
    return a.perfil === 'gerente' ? -1 : 1;
  });

  el.innerHTML = ordenados.map(u => {
    const iniciais = u.nome.split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const chip     = u.perfil === 'gerente'
      ? '<span class="gu-chip gu-chip-g">Gestor</span>'
      : '<span class="gu-chip gu-chip-c">Consultor</span>';
    const login = u.ultimo_login
      ? `Último acesso: ${new Date(u.ultimo_login).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}`
      : 'Nunca acessou';
    const emailSafe = u.email.replace(/'/g, "\\'");
    const nomeSafe  = u.nome.replace(/'/g, "\\'");
    const uidSafe   = (u.uid || '').replace(/'/g, "\\'");

    return `
    <div class="gu-user-row" id="gu-row-${uidSafe || u.email.replace(/[@.]/g,'_')}">
      <div class="gu-av" style="background:${u.cor}">${iniciais}</div>
      <div class="gu-info">
        <div class="gu-name">${u.nome}</div>
        <div class="gu-email">${u.email}</div>
        <div class="gu-meta">${login}</div>
      </div>
      ${chip}
      <div class="gu-row-actions">
        <button class="gu-btn-act" onclick="guResetarSenha('${uidSafe}','${emailSafe}','${nomeSafe}',this)" title="Redefinir senha para Mudar@123">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Redefinir senha
        </button>
      </div>
    </div>`;
  }).join('');
}

// ── Filtro de busca ───────────────────────────────────────────
function guFiltrarLista() {
  const q = (document.getElementById('gu-busca')?.value || '').toLowerCase().trim();
  if (!q) { guRenderLista(_guUsuariosAuth); return; }
  guRenderLista(_guUsuariosAuth.filter(u =>
    u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  ));
}

// ── Toggle visibilidade da senha ──────────────────────────────
function guToggleSenha(btn) {
  const inp = document.getElementById('gu-senha');
  if (!inp) return;
  const oculto = inp.type === 'password';
  inp.type = oculto ? 'text' : 'password';
  btn.textContent = oculto ? '🙈' : '👁';
}

// ── Toggle campo consultor conforme perfil ────────────────────
function guOnPerfilChange() {
  const perfil = document.getElementById('gu-perfil')?.value;
  const wrapC  = document.getElementById('gu-wrap-consultor');
  const wrapG  = document.getElementById('gu-hint-gerente');
  if (wrapC) wrapC.style.display = perfil === 'consultor' ? 'flex' : 'none';
  if (wrapG) wrapG.style.display = perfil === 'gerente'   ? 'block' : 'none';
}

// ── Limpar formulário ─────────────────────────────────────────
function guLimparForm() {
  ['gu-nome','gu-email','gu-consultor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('invalid'); }
  });
  const senha = document.getElementById('gu-senha');
  if (senha) senha.value = 'Mudar@123';
  const perfil = document.getElementById('gu-perfil');
  if (perfil) { perfil.value = 'consultor'; guOnPerfilChange(); }
  _guToast('novo', '', '');
}

// ── Toast interno ─────────────────────────────────────────────
function _guToast(painel, tipo, msg) {
  const el = document.getElementById(`gu-toast-${painel}`);
  if (!el) return;
  if (!tipo) { el.style.display = 'none'; return; }
  el.className = `gu-toast ${tipo}`;
  el.innerHTML = msg;
  el.style.display = 'block';
}

// ============================================================
//  REDEFINIR SENHA (via admin-proxy ou fallback)
// ============================================================
async function guResetarSenha(uid, email, nome, btn) {
  if (!confirm(`Redefinir a senha de "${nome}" para "Mudar@123"?\n\nNo próximo acesso, o sistema exigirá que ele(a) crie uma nova senha.`)) return;

  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="gu-spin" style="width:14px;height:14px;border-width:2px;margin:0 auto;"></div>';

  try {
    // Se não tiver uid, busca pelo e-mail na lista de usuários Auth
    let uidFinal = uid;
    if (!uidFinal) {
      const data = await _adminCall('list_users');
      const found = (data.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (found) uidFinal = found.id;
    }

    if (!uidFinal) throw new Error('Usuário não encontrado no Supabase Auth. Verifique se o cadastro existe.');

    // Redefine a senha via admin-proxy
    await _adminCall('reset_password', { uid: uidFinal, password: 'Mudar@123' });

    // Feedback visual
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Redefinida!`;
    btn.style.borderColor = '#22c55e33';
    btn.style.color = '#22c55e';
    setTimeout(() => {
      btn.innerHTML = orig; btn.style.borderColor = ''; btn.style.color = ''; btn.disabled = false;
    }, 3500);

  } catch(e) {
    console.error('Erro ao redefinir senha:', e);
    btn.innerHTML = orig; btn.disabled = false;
    const row = btn.closest('.gu-user-row');
    if (row) {
      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'font-size:11px;color:#fca5a5;margin-top:6px;padding:6px 10px;background:#ef444411;border-radius:6px;';
      errDiv.textContent = `⚠ ${e.message || 'Não foi possível redefinir. Tente pelo SQL Editor no Supabase Dashboard.'}`;
      row.insertAdjacentElement('afterend', errDiv);
      setTimeout(() => errDiv.remove(), 6000);
    }
  }
}

// ============================================================
//  CRIAR NOVO USUÁRIO (via admin-proxy)
// ============================================================
async function guCriarUsuario() {
  const nome   = (document.getElementById('gu-nome')?.value   || '').trim();
  const email  = (document.getElementById('gu-email')?.value  || '').trim().toLowerCase();
  const perfil = document.getElementById('gu-perfil')?.value  || 'consultor';
  const consul = (document.getElementById('gu-consultor')?.value || '').trim();
  const senha  = (document.getElementById('gu-senha')?.value  || 'Mudar@123').trim();
  const btn    = document.getElementById('gu-btn-criar');

  // Limpa estado de erro
  ['gu-nome','gu-email','gu-consultor','gu-senha'].forEach(id =>
    document.getElementById(id)?.classList.remove('invalid'));
  _guToast('novo', '', '');

  // Validações
  let erros = [];
  if (!nome)                                     { erros.push('Nome obrigatório.');      document.getElementById('gu-nome')?.classList.add('invalid'); }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                                                 { erros.push('E-mail inválido.');       document.getElementById('gu-email')?.classList.add('invalid'); }
  if (perfil === 'consultor' && !consul)         { erros.push('Informe o apelido do consultor.'); document.getElementById('gu-consultor')?.classList.add('invalid'); }
  if (senha.length < 8)                          { erros.push('Senha deve ter no mínimo 8 caracteres.'); document.getElementById('gu-senha')?.classList.add('invalid'); }
  if (USUARIOS.find(u => u.email.toLowerCase() === email))
                                                 { erros.push('Este e-mail já está na lista de acesso.'); document.getElementById('gu-email')?.classList.add('invalid'); }
  if (erros.length) {
    _guToast('novo', 'err', erros.map(e => `• ${e}`).join('<br>'));
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<div class="gu-spin" style="width:14px;height:14px;border-width:2px;"></div> Criando…';

  try {
    // 1. Criar na autenticação via admin-proxy
    await _adminCall('create_user', {
      email, password: senha,
      user_metadata: { nome, perfil, consultor: perfil === 'gerente' ? '' : consul }
    });

    // 2. Adiciona na lista local para a sessão atual (persistência real fica no Supabase)
    const novoLocal = { nome, email, perfil, consultor: perfil === 'gerente' ? '' : consul };
    USUARIOS.push(novoLocal);

    // 3. Feedback e atualiza lista
    _guToast('novo', 'ok',
      `✅ Usuário <strong>${nome}</strong> criado com sucesso!<br>` +
      `Perfil: <strong>${perfil === 'gerente' ? 'Gestor de Projetos' : 'Consultor'}</strong> · ` +
      `Senha inicial: <strong>${senha}</strong>`
    );
    guLimparForm();

    // Atualiza aba de lista
    guCarregarUsuarios();

  } catch(e) {
    console.error('Erro ao criar usuário:', e);
    const msg = e.message?.includes('already') || e.message?.includes('existe')
      ? 'Este e-mail já existe na autenticação do Supabase.'
      : (e.message || 'Erro ao criar usuário. Verifique o Supabase Dashboard.');
    _guToast('novo', 'err', `❌ ${msg}`);
  }

  btn.disabled = false;
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Criar acesso';
}

// ============================================================
//  ATUALIZAÇÃO AUTOMÁTICA A CADA 60 SEGUNDOS
// ============================================================
function iniciarAutoRefresh() {
  clearInterval(_autoRefreshTimer);
  _autoRefreshTimer = setInterval(async () => {
    const modalAberto = document.querySelector('.overlay.open, #overlay.open');
    if (modalAberto) return;
    await carregarDadosDoSupabase(true);
  }, 60000);
}

function adicionarBotaoRefresh() {
  const topbar = document.querySelector('.topbar');
  if (!topbar || document.getElementById('btn-refresh')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-refresh';
  btn.title = 'Atualizar dados agora';
  btn.style.cssText = 'background:none;border:1px solid #1e3d5c;border-radius:6px;color:#7aadcc;cursor:pointer;padding:5px 10px;font-size:13px;transition:all .15s;margin-left:auto;';
  btn.innerHTML = '&#x1F504;';
  btn.onmouseover = () => { btn.style.borderColor='#00c4cc'; btn.style.color='#00c4cc'; };
  btn.onmouseout  = () => { btn.style.borderColor='#1e3d5c'; btn.style.color='#7aadcc'; };
  btn.onclick = async () => {
    btn.innerHTML='&#x23F3;'; btn.disabled=true;
    await carregarDadosDoSupabase(true);
    btn.innerHTML='&#x1F504;'; btn.disabled=false;
  };
  const badge = topbar.querySelector('.manager-badge');
  if (badge) topbar.insertBefore(btn, badge);
  else topbar.appendChild(btn);
}

// ============================================================
//  GARANTE QUE CADA CLIENTE DA F2 TAMBÉM EXISTE NA F3
// ============================================================
async function _garantirProjetosF3(token) {
  for (const p2 of RAW.f2) {
    // Verifica se já existe na f3
    const jaExiste = (RAW.f3||[]).find(p => p.c === p2.c);
    if (jaExiste) continue;

    // Cria o projeto na f3 como cópia da f2
    const novoF3 = {
      cliente:            p2.c,
      fase:               3,
      consultor:          p2.cons  || '',
      pacote:             p2.pkg   || 'P',
      status:             'NÃO INICIADO',
      prazo:              '',
      atividade_atual:    '',
      responsavel_tarefa: '',
      suporte:            p2.sus   || '',
      act_ambiente: '', act_acesso: '', act_planilha: '', act_hmg: '',
      act_validacao: '', act_prd: '', act_dif: '', act_nfse: '',
      ultima_atualizacao: ''
    };

    const res = await sbPost('projects', novoF3, token);
    if (res && res[0]) {
      const novoProjeto = {
        c:    p2.c, cons: p2.cons, pkg: p2.pkg,
        st:   'NÃO INICIADO', prazo: '', atv: '',
        blk:  '', sus: p2.sus, upd: '',
        acts: { amb:'', ac:'', pl:'', hmg:'', val:'', prd:'', dif:'', nfse:'' },
        tasks3: {},
        _uuid: res[0].id
      };
      if (!RAW.f3) RAW.f3 = [];
      RAW.f3.push(novoProjeto);
      PROJECT_ID_CACHE[`${p2.c}_f3`] = res[0].id;
      console.log(`✅ Projeto F3 criado automaticamente: ${p2.c}`);
    }
  }
}

// ============================================================
//  CARREGAR DADOS DO SUPABASE
// ============================================================
async function carregarDadosDoSupabase(silencioso = false) {
  if (!silencioso) showLoadingOverlay(true);

  try {
    const token = CURRENT_USER?.access_token;
    let query = 'select=*,tasks(*)&deleted_at=is.null&order=cliente.asc';
    if (CURRENT_USER?.perfil==='consultor' && CURRENT_USER?.consultor) {
      query += `&consultor=eq.${encodeURIComponent(CURRENT_USER.consultor)}`;
    }

    const projects = await sbGet('projects', query, token);
    RAW.f1=[]; RAW.f2=[]; RAW.f3=[];

    if (projects && projects.length > 0) {
      projects.forEach(proj => {
        const p = {
          c:proj.cliente, cons:proj.consultor, pkg:proj.pacote,
          st:proj.status, prazo:proj.prazo, atv:proj.atividade_atual,
          blk:proj.responsavel_tarefa, sus:proj.suporte, upd:proj.ultima_atualizacao,
          acts:{
            amb:proj.act_ambiente, ac:proj.act_acesso, pl:proj.act_planilha,
            hmg:proj.act_hmg, val:proj.act_validacao, prd:proj.act_prd,
            dif:proj.act_dif, nfse:proj.act_nfse,
          },
          _uuid:proj.id
        };
        if (proj.tasks && proj.tasks.length>0) {
          const tasksObj={};
          proj.tasks.sort((a,b)=>a.ordem-b.ordem).forEach(t=>{
            tasksObj[t.task_key]={status:t.status||'',resp:t.responsavel||'',date:t.data_conclusao||''};
            if(t.is_custom) tasksObj[t.task_key]._label=t.label;
          });
          if(proj.fase===1) p.tasks=tasksObj;
          if(proj.fase===2) p.tasks2=tasksObj;
          if(proj.fase===3) p.tasks3=tasksObj;
        }
        PROJECT_ID_CACHE[`${proj.cliente}_f${proj.fase}`]=proj.id;
        if(proj.fase===1) RAW.f1.push(p);
        if(proj.fase===2) RAW.f2.push(p);
        if(proj.fase===3) { if(!RAW.f3) RAW.f3=[]; RAW.f3.push(p); }
      });
    }
    console.log(`✅ ${RAW.f1.length} F1 · ${RAW.f2.length} F2 · ${RAW.f3.length} F3 carregados.`);

    // Auto-cria projetos Fase 3 para clientes que têm Fase 2 mas não têm Fase 3
    if (RAW.f3.length === 0) await _garantirProjetosF3(token);
  } catch(e) { console.error('Erro ao carregar:', e); }

  if (!silencioso) showLoadingOverlay(false);
  render();
  // Reaplica restrições de perfil após qualquer render (auto-refresh incluso)
  if (CURRENT_USER?.perfil === 'consultor') requestAnimationFrame(() => _aplicarRestricaoConsultor());
}

// ============================================================
//  CRIAR PROJETO NO SUPABASE
// ============================================================
async function criarProjetoNoSupabase(novo, fase) {
  if (!CURRENT_USER?.access_token) return;
  // Criar projetos é ação exclusiva de gerentes
  if (CURRENT_USER.perfil !== 'gerente') {
    console.warn('[auth] Criação de projeto bloqueada: perfil insuficiente.');
    return;
  }
  const token = CURRENT_USER.access_token;
  const faseNum = parseInt(fase);
  const res = await sbPost('projects', {
    cliente:novo.c, fase:faseNum, consultor:novo.cons||'', pacote:novo.pkg||'P',
    status:novo.st||'NÃO INICIADO', prazo:novo.prazo||'',
    atividade_atual:novo.atv||'', responsavel_tarefa:novo.blk||'', suporte:novo.sus||'',
    act_ambiente:'', act_acesso:'', act_planilha:'', act_hmg:'',
    act_validacao:'', act_prd:'', act_dif:'', act_nfse:'',
    ultima_atualizacao:novo.upd||''
  }, token);
  if (res && res[0]) {
    novo._uuid = res[0].id;
    PROJECT_ID_CACHE[`${novo.c}_f${fase}`] = res[0].id;
    console.log('✅ Novo projeto criado no Supabase:', novo.c);
  }
}

// ============================================================
//  EXCLUIR PROJETO NO SUPABASE
// ============================================================
async function excluirProjetoNoSupabase(proj, fase) {
  if (!CURRENT_USER?.access_token) return;
  // Excluir projetos é ação exclusiva de gerentes
  if (CURRENT_USER.perfil !== 'gerente') {
    console.warn('[auth] Exclusão de projeto bloqueada: perfil insuficiente.');
    return;
  }
  const uuid = proj._uuid || await getProjectUuid(proj.c, fase);
  if (uuid) await sbPatch('projects', `id=eq.${uuid}`, { deleted_at: new Date().toISOString() }, CURRENT_USER.access_token);
}

// ============================================================
//  OVERLAYS
// ============================================================
function showLoadingOverlay(show) {
  let el=document.getElementById('sb-loading-overlay');
  if(!el){
    el=document.createElement('div'); el.id='sb-loading-overlay';
    el.style.cssText='position:fixed;inset:0;background:rgba(8,20,32,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9998;gap:16px;font-family:Inter,sans-serif;';
    el.innerHTML='<div style="width:48px;height:48px;border:3px solid #1e3d5c;border-top-color:#00c4cc;border-radius:50%;animation:sb-spin .8s linear infinite"></div><div style="color:#00c4cc;font-size:14px;font-weight:600">Carregando dados...</div><style>@keyframes sb-spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(el);
  }
  el.style.display=show?'flex':'none';
}

function showSyncIndicator() {
  let el=document.getElementById('sb-sync-dot');
  if(!el){
    el=document.createElement('div'); el.id='sb-sync-dot';
    el.style.cssText='position:fixed;bottom:16px;left:16px;background:#0d1f30;border:1px solid #00c4cc44;border-radius:20px;padding:5px 12px;font-size:11px;font-weight:600;color:#00c4cc;display:flex;align-items:center;gap:6px;z-index:500;opacity:0;transition:opacity .3s;pointer-events:none;';
    el.innerHTML='<span style="width:7px;height:7px;border-radius:50%;background:#00c4cc;animation:sb-pulse 1s ease-in-out infinite"></span>Salvando...<style>@keyframes sb-pulse{0%,100%{opacity:1}50%{opacity:.3}}</style>';
    document.body.appendChild(el);
  }
  el.style.opacity='1';
  clearTimeout(el._timer);
  el._timer=setTimeout(()=>{el.style.opacity='0';},2500);
}

// ============================================================
//  INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await new Promise(r=>setTimeout(r,150));
  try {
    const sessao=sessionStorage.getItem('kanban_session');
    if(sessao){
      CURRENT_USER=JSON.parse(sessao);
      const res=await fetch(`${SUPABASE_URL}/auth/v1/user`,{
        headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+CURRENT_USER.access_token}
      });
      if(res.ok){ await iniciarApp(); return; }
    }
  } catch(e){}
  mostrarTelaLogin();
});
