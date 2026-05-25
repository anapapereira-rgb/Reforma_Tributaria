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
  const token = CURRENT_USER.access_token;

  showSyncIndicator();

  const payload = {
    contato_nome:     data.contatoFiscal || '',
    contato_telefone: data.contatoTI     || '',
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
  iniciarAutoRefresh();
  adicionarBotaoRefresh();
}

function atualizarTopbar() {
  if (!CURRENT_USER) return;
  const badge = document.querySelector('.manager-badge');
  if (!badge) return;
  const iniciais    = CURRENT_USER.nome.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
  const cor         = CURRENT_USER.perfil==='gerente' ? 'linear-gradient(135deg,#00c4cc,#0088ff)' : 'linear-gradient(135deg,#a855f7,#6366f1)';
  const labelPerfil = CURRENT_USER.perfil==='gerente' ? 'Gerente de Projetos' : 'Consultor';
  const btnUsuarios = CURRENT_USER.perfil==='gerente'
    ? `<button onclick="abrirGerenciarUsuarios()" title="Gerenciar Usuários" style="background:none;border:1px solid #1e3d5c;border-radius:6px;color:#7aadcc;
        cursor:pointer;font-size:12px;margin-left:6px;padding:4px 10px;line-height:1;transition:all .15s;font-family:Inter,sans-serif;"
        onmouseover="this.style.borderColor='#00c4cc';this.style.color='#00c4cc'" onmouseout="this.style.borderColor='#1e3d5c';this.style.color='#7aadcc'">
        👥 Usuários</button>`
    : '';
  badge.innerHTML = `
    <div class="avatar" style="background:${cor};font-size:11px;">${iniciais}</div>
    <span>${CURRENT_USER.nome} · ${labelPerfil}</span>
    ${btnUsuarios}
    <button onclick="fazerLogout()" title="Sair" style="background:none;border:none;color:#7aadcc;
      cursor:pointer;font-size:16px;margin-left:6px;padding:0;line-height:1;transition:color .15s;"
      onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#7aadcc'">&#x23FB;</button>
  `;
  if (CURRENT_USER.perfil==='consultor' && CURRENT_USER.consultor) {
    setTimeout(() => {
      document.querySelectorAll('.cons-btn').forEach(btn => {
        const t = btn.textContent.trim();
        if (t!=='Todos' && !t.includes(CURRENT_USER.consultor)) btn.style.display='none';
      });
      document.querySelectorAll('[id^="sb-cons-"]').forEach(btn => {
        if (btn.id!=='sb-cons-all' && !btn.id.toLowerCase().includes(CURRENT_USER.consultor.toLowerCase()))
          btn.style.display='none';
      });
    }, 500);
  }
}

// ============================================================
//  TELA DE GERENCIAMENTO DE USUÁRIOS (apenas gerentes)
// ============================================================
function abrirGerenciarUsuarios() {
  if (!CURRENT_USER || CURRENT_USER.perfil !== 'gerente') return;

  let overlay = document.getElementById('gu-overlay');
  if (overlay) { overlay.remove(); }

  overlay = document.createElement('div');
  overlay.id = 'gu-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(8,20,32,.85);display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;backdrop-filter:blur(4px);';
  overlay.innerHTML = `
    <style>
      #gu-modal{background:#0d1f30;border:1px solid #1e3d5c;border-radius:16px;padding:32px 36px;
        width:100%;max-width:680px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.7);
        animation:guFade .25s ease;}
      @keyframes guFade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
      #gu-modal h2{font-size:18px;font-weight:800;color:#e8f4fd;margin-bottom:4px;}
      #gu-modal .gu-sub{font-size:12px;color:#7aadcc;margin-bottom:24px;}
      .gu-section{margin-bottom:28px;}
      .gu-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
        color:#00c4cc;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1e3d5c;}
      .gu-user-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;
        background:#112840;border:1px solid #1e3d5c;margin-bottom:8px;transition:border-color .15s;}
      .gu-user-row:hover{border-color:#2a5278;}
      .gu-avatar{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:700;color:#fff;flex-shrink:0;}
      .gu-user-info{flex:1;min-width:0;}
      .gu-user-name{font-size:13px;font-weight:600;color:#e8f4fd;}
      .gu-user-email{font-size:11px;color:#7aadcc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .gu-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;flex-shrink:0;}
      .gu-badge-g{background:#00c4cc22;color:#00c4cc;border:1px solid #00c4cc44;}
      .gu-badge-c{background:#a855f722;color:#a855f7;border:1px solid #a855f744;}
      .gu-btn-reset{background:none;border:1px solid #1e3d5c;border-radius:6px;color:#7aadcc;
        cursor:pointer;font-size:11px;padding:4px 10px;transition:all .15s;font-family:Inter,sans-serif;flex-shrink:0;}
      .gu-btn-reset:hover{border-color:#f59e0b;color:#f59e0b;}
      .gu-divider{height:1px;background:#1e3d5c;margin:24px 0;}
      .gu-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
      .gu-field{display:flex;flex-direction:column;gap:5px;}
      .gu-field.full{grid-column:1/-1;}
      .gu-field label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7aadcc;}
      .gu-field input,.gu-field select{background:#112840;border:1px solid #1e3d5c;border-radius:8px;
        padding:9px 12px;color:#e8f4fd;font-size:13px;font-family:Inter,sans-serif;outline:none;
        transition:border-color .15s;width:100%;box-sizing:border-box;}
      .gu-field input:focus,.gu-field select:focus{border-color:#00c4cc;}
      .gu-field select option{background:#112840;}
      .gu-actions{display:flex;gap:10px;margin-top:20px;justify-content:flex-end;}
      .gu-btn-cancel{padding:10px 20px;border:1px solid #1e3d5c;border-radius:8px;background:none;
        color:#7aadcc;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;transition:all .15s;}
      .gu-btn-cancel:hover{border-color:#2a5278;color:#e8f4fd;}
      .gu-btn-criar{padding:10px 24px;border:none;border-radius:8px;
        background:linear-gradient(135deg,#00c4cc,#0088ff);color:#fff;font-size:13px;
        font-weight:700;cursor:pointer;font-family:Inter,sans-serif;transition:opacity .15s;}
      .gu-btn-criar:hover{opacity:.88;} .gu-btn-criar:disabled{opacity:.5;cursor:not-allowed;}
      .gu-msg{padding:10px 14px;border-radius:8px;font-size:12px;margin-top:12px;display:none;grid-column:1/-1;}
      .gu-msg.ok{background:#22c55e22;border:1px solid #22c55e44;color:#86efac;}
      .gu-msg.err{background:#ef444422;border:1px solid #ef444444;color:#f87171;}
    </style>
    <div id="gu-modal">
      <h2>👥 Gerenciar Usuários</h2>
      <div class="gu-sub">Visualize, redefina senhas e crie novos acessos ao sistema.</div>

      <!-- Lista de usuários existentes -->
      <div class="gu-section">
        <div class="gu-section-title">Usuários cadastrados</div>
        <div id="gu-user-list"></div>
      </div>

      <div class="gu-divider"></div>

      <!-- Formulário de novo usuário -->
      <div class="gu-section">
        <div class="gu-section-title">➕ Criar novo acesso</div>
        <div class="gu-form">
          <div class="gu-field">
            <label>Nome</label>
            <input type="text" id="gu-nome" placeholder="Ex: Carlos Silva"/>
          </div>
          <div class="gu-field">
            <label>E-mail</label>
            <input type="email" id="gu-email" placeholder="usuario@totvs.com.br"/>
          </div>
          <div class="gu-field">
            <label>Perfil</label>
            <select id="gu-perfil" onchange="guToggleConsultor()">
              <option value="consultor">Consultor</option>
              <option value="gerente">Gerente de Projetos</option>
            </select>
          </div>
          <div class="gu-field" id="gu-consultor-wrap">
            <label>Nome do Consultor (filtro Kanban)</label>
            <input type="text" id="gu-consultor" placeholder="Ex: Carlos"/>
          </div>
          <div class="gu-field full">
            <label>Senha inicial</label>
            <input type="text" id="gu-senha-ini" value="Mudar@123" placeholder="Senha provisória"/>
          </div>
          <div class="gu-msg" id="gu-criar-msg"></div>
        </div>
        <div class="gu-actions">
          <button class="gu-btn-cancel" onclick="document.getElementById('gu-overlay').remove()">Fechar</button>
          <button class="gu-btn-criar" id="gu-btn-criar" onclick="guCriarUsuario()">✓ Criar acesso</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Renderizar lista de usuários
  _guRenderLista();
}

function guToggleConsultor() {
  const perfil = document.getElementById('gu-perfil').value;
  const wrap   = document.getElementById('gu-consultor-wrap');
  if (wrap) wrap.style.display = perfil === 'consultor' ? 'flex' : 'none';
}

function _guRenderLista() {
  const el = document.getElementById('gu-user-list');
  if (!el) return;
  const cores = ['#6366f1','#14b8a6','#f59e0b','#ec4899','#22c55e','#a855f7','#3b82f6','#ef4444'];
  el.innerHTML = USUARIOS.map((u, i) => {
    const iniciais = u.nome.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
    const cor      = cores[i % cores.length];
    const badge    = u.perfil === 'gerente'
      ? '<span class="gu-badge gu-badge-g">Gerente</span>'
      : '<span class="gu-badge gu-badge-c">Consultor</span>';
    return `
      <div class="gu-user-row">
        <div class="gu-avatar" style="background:${cor}">${iniciais}</div>
        <div class="gu-user-info">
          <div class="gu-user-name">${u.nome}</div>
          <div class="gu-user-email">${u.email}</div>
        </div>
        ${badge}
        <button class="gu-btn-reset" onclick="guResetarSenha('${u.email}','${u.nome}',this)" title="Redefinir senha para Mudar@123">
          🔑 Redefinir senha
        </button>
      </div>`;
  }).join('');
}

async function guResetarSenha(email, nome, btn) {
  if (!confirm(`Redefinir a senha de ${nome} para "Mudar@123"?\n\nEle(a) precisará alterar no próximo acesso.`)) return;
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '⏳ Aguarde...';

  try {
    // Usa o endpoint de admin via service_role se disponível, senão orienta
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + CURRENT_USER.access_token }
    });
    const data = res.ok ? await res.json() : null;
    const users = data?.users || [];
    const user  = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      // Fallback: mostra instrução
      btn.innerHTML = orig; btn.disabled = false;
      alert(`Usuário encontrado no sistema.\n\nPara redefinir a senha de ${nome}, acesse:\n🔗 Supabase Dashboard → Authentication → Users\n→ Selecione "${email}" → Send password reset email`);
      return;
    }

    const upd = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type':'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + CURRENT_USER.access_token },
      body: JSON.stringify({ password: 'Mudar@123' })
    });

    if (upd.ok) {
      btn.innerHTML = '✅ Redefinida!';
      btn.style.borderColor = '#22c55e'; btn.style.color = '#22c55e';
      setTimeout(() => { btn.innerHTML = orig; btn.style.borderColor = ''; btn.style.color = ''; btn.disabled = false; }, 3000);
    } else {
      throw new Error(await upd.text());
    }
  } catch(e) {
    console.error('Erro ao redefinir senha:', e);
    btn.innerHTML = orig; btn.disabled = false;
    alert(`Não foi possível redefinir via API.\n\nAcesse o Supabase Dashboard para redefinir manualmente:\n→ Authentication → Users → ${email}`);
  }
}

async function guCriarUsuario() {
  const nome    = (document.getElementById('gu-nome').value || '').trim();
  const email   = (document.getElementById('gu-email').value || '').trim().toLowerCase();
  const perfil  = document.getElementById('gu-perfil').value;
  const consul  = (document.getElementById('gu-consultor').value || '').trim();
  const senha   = (document.getElementById('gu-senha-ini').value || 'Mudar@123').trim();
  const msg     = document.getElementById('gu-criar-msg');
  const btn     = document.getElementById('gu-btn-criar');

  msg.style.display = 'none';

  if (!nome)  { _guMsg('err', 'Informe o nome do usuário.'); return; }
  if (!email || !email.includes('@')) { _guMsg('err', 'Informe um e-mail válido.'); return; }
  if (perfil === 'consultor' && !consul) { _guMsg('err', 'Informe o nome do consultor para o filtro.'); return; }
  if (senha.length < 8) { _guMsg('err', 'A senha deve ter pelo menos 8 caracteres.'); return; }
  if (USUARIOS.find(u => u.email.toLowerCase() === email)) { _guMsg('err', 'Este e-mail já está cadastrado.'); return; }

  btn.disabled = true; btn.textContent = '⏳ Criando...';

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + CURRENT_USER.access_token },
      body: JSON.stringify({ email, password: senha, email_confirm: true })
    });

    if (res.ok) {
      // Adiciona na lista local USUARIOS para sessão atual
      const novo = { nome, email, perfil, consultor: perfil === 'gerente' ? '' : consul };
      USUARIOS.push(novo);
      _guMsg('ok', `✅ Usuário "${nome}" criado com sucesso! Senha inicial: ${senha}`);
      _guRenderLista();
      document.getElementById('gu-nome').value = '';
      document.getElementById('gu-email').value = '';
      document.getElementById('gu-consultor').value = '';
      document.getElementById('gu-senha-ini').value = 'Mudar@123';
    } else {
      const err = await res.json();
      if (err.msg && err.msg.includes('already')) {
        _guMsg('err', 'Este e-mail já existe no sistema de autenticação.');
      } else {
        _guMsg('err', `Erro ao criar: ${err.msg || err.message || 'Verifique o Supabase Dashboard.'}`);
      }
    }
  } catch(e) {
    _guMsg('err', 'Erro de conexão. Verifique sua internet.');
  }

  btn.disabled = false; btn.textContent = '✓ Criar acesso';
}

function _guMsg(tipo, texto) {
  const el = document.getElementById('gu-criar-msg');
  if (!el) return;
  el.className = `gu-msg ${tipo}`;
  el.textContent = texto;
  el.style.display = 'block';
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
}

// ============================================================
//  CRIAR PROJETO NO SUPABASE
// ============================================================
async function criarProjetoNoSupabase(novo, fase) {
  if (!CURRENT_USER?.access_token) return;
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
