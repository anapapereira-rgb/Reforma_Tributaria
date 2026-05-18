// ============================================================
//  supabase-integration.js — v2 com Autenticação
//  Kanban Reforma Tributária · TOTVS
// ============================================================

const SUPABASE_URL = 'https://vxeoabwqkzfdwsatuvqf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_H47gHBW02AOIdECpaPiY0A_N1Bmd6H6';  

// Usuários autorizados (controle local de acesso)
const USUARIOS = [
  { nome: 'Ana Paula', email: 'ana.pa@pereira.com.br',              perfil: 'gerente',   consultor: '' },
  { nome: 'Amanda',    email: 'amanda.pfelix@totvs.com.br',         perfil: 'consultor', consultor: 'Amanda' },
  { nome: 'Daniel',    email: 'daniel.heberle@totvs.com.br',        perfil: 'consultor', consultor: 'Daniel' },
  { nome: 'Dalva',     email: 'francidalva.desousa@totvs.com.br',   perfil: 'consultor', consultor: 'Dalva' },
  { nome: 'Erica',     email: 'acsa.eromeiro@totvs.com.br',         perfil: 'consultor', consultor: 'Erica' },
  { nome: 'João',      email: 'joao.alves@totvs.com.br',            perfil: 'gerente',   consultor: '' },
  { nome: 'Otavio',    email: 'otavio.ro.biten@totvs.com.br',       perfil: 'consultor', consultor: 'Otavio' },
  { nome: 'Thaiza',    email: 'thaiza.brugnoli@totvs.com.br',       perfil: 'consultor', consultor: 'Thaiza' },
];

// Estado global do usuário logado
let CURRENT_USER = null;

// ── Cache de IDs ─────────────────────────────────────────────
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders(token) });
  return res.ok ? res.json() : [];
}

async function sbPatch(table, query, body, token) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH', headers: sbHeaders(token), body: JSON.stringify(body)
  });
}

async function sbPost(table, body, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: sbHeaders(token), body: JSON.stringify(body)
  });
  return res.ok ? res.json() : null;
}

async function sbDelete(table, query, token) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE', headers: sbHeaders(token)
  });
}

async function getProjectUuid(cliente, fase) {
  const chave = cliente + '_f' + fase;
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
//  TELA DE LOGIN
// ============================================================
function mostrarTelaLogin(erro) {
  document.body.style.overflow = 'hidden';
  let el = document.getElementById('login-screen');
  if (!el) { el = document.createElement('div'); el.id = 'login-screen'; document.body.appendChild(el); }

  el.innerHTML = `
    <style>
      #login-screen {
        position:fixed;inset:0;z-index:99999;
        background:linear-gradient(135deg,#081420 0%,#0a1e30 50%,#081420 100%);
        display:flex;align-items:center;justify-content:center;font-family:'Inter',sans-serif;
      }
      .lb { background:#0d1f30;border:1px solid #1e3d5c;border-radius:16px;padding:40px 36px;
        width:100%;max-width:400px;box-shadow:0 24px 80px rgba(0,0,0,.6);
        animation:lbFade .3s ease; }
      @keyframes lbFade { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
      .lb-logo { display:flex;align-items:center;gap:12px;margin-bottom:28px;justify-content:center; }
      .lb-logo-title { font-size:15px;font-weight:700;color:#e8f4fd; }
      .lb-logo-sub   { font-size:11px;color:#00c4cc;font-weight:500;letter-spacing:.05em;text-transform:uppercase; }
      .lb-title { font-size:20px;font-weight:800;color:#e8f4fd;margin-bottom:6px;text-align:center; }
      .lb-sub   { font-size:12px;color:#7aadcc;text-align:center;margin-bottom:28px; }
      .lb-field { display:flex;flex-direction:column;gap:6px;margin-bottom:16px; }
      .lb-field label { font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7aadcc; }
      .lb-field input {
        background:#112840;border:1px solid #1e3d5c;border-radius:8px;
        padding:10px 14px;color:#e8f4fd;font-size:14px;font-family:'Inter',sans-serif;
        outline:none;transition:border-color .15s;width:100%;box-sizing:border-box;
      }
      .lb-field input:focus { border-color:#00c4cc; }
      .lb-btn {
        width:100%;padding:12px;border:none;border-radius:8px;
        background:linear-gradient(135deg,#00c4cc,#0088ff);
        color:#fff;font-size:14px;font-weight:700;font-family:'Inter',sans-serif;
        cursor:pointer;transition:opacity .15s;margin-top:8px;
      }
      .lb-btn:hover { opacity:.88; }
      .lb-btn:disabled { opacity:.5;cursor:not-allowed; }
      .lb-err {
        background:#ef444422;border:1px solid #ef444444;border-radius:8px;
        padding:10px 14px;color:#f87171;font-size:12px;margin-bottom:16px;
        display:${erro ? 'block' : 'none'};
      }
      .lb-footer { text-align:center;margin-top:20px;font-size:11px;color:#7aadcc; }
    </style>
    <div class="lb">
      <div class="lb-logo">
        <svg viewBox="0 0 120 36" fill="none" style="height:28px;width:auto;filter:brightness(0) invert(1)">
          <path d="M16 4L28 11V25L16 32L4 25V11L16 4Z" fill="#00c4cc" opacity="0.9"/>
          <path d="M16 8L24 13V23L16 28L8 23V13L16 8Z" fill="#081420"/>
          <path d="M16 11L21.5 14.5V21.5L16 25L10.5 21.5V14.5L16 11Z" fill="#00c4cc" opacity="0.4"/>
          <text x="35" y="24" font-family="Arial" font-weight="700" font-size="18" fill="white" letter-spacing="1">TOTVS</text>
        </svg>
        <div>
          <div class="lb-logo-title">Reforma Tributária</div>
          <div class="lb-logo-sub">Gerenciamento de Projetos</div>
        </div>
      </div>
      <div class="lb-title">Bem-vindo</div>
      <div class="lb-sub">Acesse com seu e-mail corporativo</div>
      <div class="lb-err" id="lb-err">${erro || ''}</div>
      <div class="lb-field">
        <label>E-mail</label>
        <input type="email" id="lb-email" placeholder="seu@totvs.com.br" autocomplete="email"/>
      </div>
      <div class="lb-field">
        <label>Senha</label>
        <input type="password" id="lb-senha" placeholder="••••••••" autocomplete="current-password"/>
      </div>
      <button class="lb-btn" id="lb-btn" onclick="fazerLogin()">Entrar</button>
      <div class="lb-footer">Acesso restrito a usuários autorizados · TOTVS</div>
    </div>
  `;

  el.querySelector('#lb-senha').addEventListener('keydown', e => { if (e.key === 'Enter') fazerLogin(); });
  el.querySelector('#lb-email').addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('#lb-senha').focus(); });
  setTimeout(() => el.querySelector('#lb-email').focus(), 100);
}

// ============================================================
//  TELA DE TROCA DE SENHA
// ============================================================
function mostrarTrocaSenha() {
  const el = document.getElementById('login-screen');
  el.innerHTML = `
    <style>
      #login-screen {
        position:fixed;inset:0;z-index:99999;
        background:linear-gradient(135deg,#081420 0%,#0a1e30 50%,#081420 100%);
        display:flex;align-items:center;justify-content:center;font-family:'Inter',sans-serif;
      }
      .lb { background:#0d1f30;border:1px solid #1e3d5c;border-radius:16px;padding:40px 36px;
        width:100%;max-width:400px;box-shadow:0 24px 80px rgba(0,0,0,.6); }
      .lb-title { font-size:20px;font-weight:800;color:#e8f4fd;margin-bottom:6px;text-align:center; }
      .lb-sub   { font-size:12px;color:#7aadcc;text-align:center;margin-bottom:20px;line-height:1.6; }
      .lb-aviso {
        background:#f59e0b22;border:1px solid #f59e0b44;border-radius:8px;
        padding:12px 14px;color:#fbbf24;font-size:12px;margin-bottom:20px;line-height:1.6;
      }
      .lb-field { display:flex;flex-direction:column;gap:6px;margin-bottom:16px; }
      .lb-field label { font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7aadcc; }
      .lb-field input {
        background:#112840;border:1px solid #1e3d5c;border-radius:8px;
        padding:10px 14px;color:#e8f4fd;font-size:14px;font-family:'Inter',sans-serif;
        outline:none;transition:border-color .15s;width:100%;box-sizing:border-box;
      }
      .lb-field input:focus { border-color:#00c4cc; }
      .lb-btn {
        width:100%;padding:12px;border:none;border-radius:8px;
        background:linear-gradient(135deg,#00c4cc,#0088ff);
        color:#fff;font-size:14px;font-weight:700;font-family:'Inter',sans-serif;
        cursor:pointer;transition:opacity .15s;margin-top:8px;
      }
      .lb-btn:hover { opacity:.88; }
      .lb-err {
        background:#ef444422;border:1px solid #ef444444;border-radius:8px;
        padding:10px 14px;color:#f87171;font-size:12px;margin-bottom:16px;display:none;
      }
    </style>
    <div class="lb">
      <div class="lb-title">🔐 Crie sua senha</div>
      <div class="lb-sub">Primeiro acesso detectado.<br>Defina uma nova senha para continuar.</div>
      <div class="lb-aviso">⚠ A senha padrão <strong>Mudar@123</strong> deve ser substituída agora.<br>Use pelo menos 8 caracteres.</div>
      <div class="lb-err" id="lb-err"></div>
      <div class="lb-field"><label>Nova senha</label><input type="password" id="nova-senha" placeholder="Mínimo 8 caracteres"/></div>
      <div class="lb-field"><label>Confirmar senha</label><input type="password" id="conf-senha" placeholder="Repita a senha"/></div>
      <button class="lb-btn" onclick="trocarSenha()">Salvar e entrar</button>
    </div>
  `;
}

// ============================================================
//  LOGIN
// ============================================================
async function fazerLogin() {
  const email = document.getElementById('lb-email').value.trim().toLowerCase();
  const senha  = document.getElementById('lb-senha').value;
  const btn    = document.getElementById('lb-btn');
  const errEl  = document.getElementById('lb-err');

  if (!email || !senha) { errEl.textContent = 'Preencha e-mail e senha.'; errEl.style.display = 'block'; return; }

  const usuarioLocal = USUARIOS.find(u => u.email.toLowerCase() === email);
  if (!usuarioLocal) {
    errEl.textContent = 'E-mail não autorizado. Fale com o administrador.';
    errEl.style.display = 'block'; return;
  }

  btn.disabled = true; btn.textContent = 'Entrando...'; errEl.style.display = 'none';

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ email, password: senha })
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = 'E-mail ou senha incorretos.';
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Entrar'; return;
    }

    CURRENT_USER = { ...usuarioLocal, access_token: data.access_token, refresh_token: data.refresh_token, uid: data.user?.id };
    sessionStorage.setItem('kanban_session', JSON.stringify(CURRENT_USER));

    if (senha === 'Mudar@123') { mostrarTrocaSenha(); return; }
    await iniciarApp();

  } catch(e) {
    errEl.textContent = 'Erro de conexão. Verifique sua internet.';
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

// ============================================================
//  TROCA DE SENHA
// ============================================================
async function trocarSenha() {
  const nova  = document.getElementById('nova-senha').value;
  const conf  = document.getElementById('conf-senha').value;
  const errEl = document.getElementById('lb-err');

  if (nova.length < 8) { errEl.textContent = 'Mínimo 8 caracteres.'; errEl.style.display = 'block'; return; }
  if (nova !== conf)   { errEl.textContent = 'As senhas não coincidem.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + CURRENT_USER.access_token },
    body: JSON.stringify({ password: nova })
  });

  if (!res.ok) { errEl.textContent = 'Erro ao salvar. Tente novamente.'; errEl.style.display = 'block'; return; }
  await iniciarApp();
}

// ============================================================
//  LOGOUT
// ============================================================
function fazerLogout() {
  sessionStorage.removeItem('kanban_session');
  CURRENT_USER = null;
  location.reload();
}

// ============================================================
//  INICIAR APP
// ============================================================
async function iniciarApp() {
  const loginEl = document.getElementById('login-screen');
  if (loginEl) loginEl.remove();
  document.body.style.overflow = '';
  atualizarTopbar();
  await carregarDadosDoSupabase();
}

function atualizarTopbar() {
  if (!CURRENT_USER) return;
  const badge = document.querySelector('.manager-badge');
  if (!badge) return;
  const iniciais   = CURRENT_USER.nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const cor        = CURRENT_USER.perfil === 'gerente' ? 'linear-gradient(135deg,#00c4cc,#0088ff)' : 'linear-gradient(135deg,#a855f7,#6366f1)';
  const labelPerfil = CURRENT_USER.perfil === 'gerente' ? 'Gerente' : 'Consultor';
  badge.innerHTML = `
    <div class="avatar" style="background:${cor};font-size:11px;">${iniciais}</div>
    <span>${CURRENT_USER.nome} · ${labelPerfil}</span>
    <button onclick="fazerLogout()" title="Sair" style="
      background:none;border:none;color:#7aadcc;cursor:pointer;font-size:16px;
      margin-left:6px;padding:0;line-height:1;transition:color .15s;
    " onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#7aadcc'">⏻</button>
  `;

  // Consultor: esconde botões de outros consultores
  if (CURRENT_USER.perfil === 'consultor' && CURRENT_USER.consultor) {
    document.querySelectorAll('.cons-btn').forEach(btn => {
      const texto = btn.textContent.trim();
      if (texto !== 'Todos' && !texto.includes(CURRENT_USER.consultor)) btn.style.display = 'none';
    });
    document.querySelectorAll('[id^="sb-cons-"]').forEach(btn => {
      if (btn.id !== 'sb-cons-all' && !btn.id.includes(CURRENT_USER.consultor)) btn.style.display = 'none';
    });
  }
}

// ============================================================
//  CARREGAR DADOS DO SUPABASE
// ============================================================
async function carregarDadosDoSupabase() {
  console.log('🔄 Carregando dados do Supabase...');
  showLoadingOverlay(true);

  try {
    const token = CURRENT_USER?.access_token;
    let query = 'select=*,tasks(*)&deleted_at=is.null&order=cliente.asc';

    // Consultor só vê seus próprios projetos
    if (CURRENT_USER?.perfil === 'consultor' && CURRENT_USER?.consultor) {
      query += `&consultor=eq.${encodeURIComponent(CURRENT_USER.consultor)}`;
    }

    const projects = await sbGet('projects', query, token);

    RAW.f1 = []; RAW.f2 = [];

    if (projects && projects.length > 0) {
      projects.forEach(proj => {
        const p = {
          c: proj.cliente, cons: proj.consultor, pkg: proj.pacote,
          st: proj.status, prazo: proj.prazo, atv: proj.atividade_atual,
          blk: proj.responsavel_tarefa, sus: proj.suporte, upd: proj.ultima_atualizacao,
          acts: {
            amb: proj.act_ambiente, ac: proj.act_acesso, pl: proj.act_planilha,
            hmg: proj.act_hmg, val: proj.act_validacao, prd: proj.act_prd,
            dif: proj.act_dif, nfse: proj.act_nfse,
          },
          _uuid: proj.id
        };

        if (proj.tasks && proj.tasks.length > 0) {
          const tasksObj = {};
          proj.tasks.sort((a, b) => a.ordem - b.ordem).forEach(t => {
            tasksObj[t.task_key] = { status: t.status || '', resp: t.responsavel || '', date: t.data_conclusao || '' };
            if (t.is_custom) tasksObj[t.task_key]._label = t.label;
          });
          if (proj.fase === 1) p.tasks  = tasksObj;
          if (proj.fase === 2) p.tasks2 = tasksObj;
        }

        PROJECT_ID_CACHE[proj.cliente + '_f' + proj.fase] = proj.id;
        if (proj.fase === 1) RAW.f1.push(p);
        if (proj.fase === 2) RAW.f2.push(p);
      });
    }

    console.log(`✅ ${RAW.f1.length} F1 · ${RAW.f2.length} F2 carregados.`);
  } catch(e) { console.error('❌ Erro ao carregar:', e); }

  showLoadingOverlay(false);
  render();
}

// ============================================================
//  SALVAR PROJETO
// ============================================================
const _persistOriginal = window.persistProjectState;
window.persistProjectState = async function(p) {
  if (_persistOriginal) _persistOriginal(p);
  showSyncIndicator();
  const token = CURRENT_USER?.access_token;
  const fase  = RAW.f1.includes(p) ? 1 : 2;
  const uuid  = p._uuid || await getProjectUuid(p.c, fase);
  if (!uuid) return;

  await sbPatch('projects', `id=eq.${uuid}`, {
    consultor: p.cons||'', pacote: p.pkg||'P', status: p.st||'',
    prazo: p.prazo||'', atividade_atual: p.atv||'', responsavel_tarefa: p.blk||'',
    suporte: p.sus||'',
    act_ambiente: (p.acts||{}).amb||'', act_acesso: (p.acts||{}).ac||'',
    act_planilha: (p.acts||{}).pl||'', act_hmg: (p.acts||{}).hmg||'',
    act_validacao: (p.acts||{}).val||'', act_prd: (p.acts||{}).prd||'',
    act_dif: (p.acts||{}).dif||'', act_nfse: (p.acts||{}).nfse||'',
    ultima_atualizacao: p.upd||'', updated_at: new Date().toISOString()
  }, token);

  const tasksObj  = fase === 1 ? (p.tasks||{}) : (p.tasks2||{});
  const listaBase = fase === 1 ? F1_TASKS : F2_TASKS;
  let idx = 0;
  for (const [key, td] of Object.entries(tasksObj)) {
    const isCustom = key.startsWith('cx_') || key.startsWith('cx2_');
    const base  = listaBase.find(t => t.k === key);
    const label = isCustom ? (td._label||key) : (base ? base.label : key);
    const ex = await sbGet('tasks', `project_id=eq.${uuid}&task_key=eq.${key}&select=id`, token);
    if (ex && ex[0]) {
      await sbPatch('tasks', `id=eq.${ex[0].id}`, {
        status: td.status||'', responsavel: td.resp||'',
        data_conclusao: toIso(td.date)||null, updated_at: new Date().toISOString()
      }, token);
    } else {
      await sbPost('tasks', {
        project_id: uuid, task_key: key, label, is_custom: isCustom,
        status: td.status||'', responsavel: td.resp||'',
        data_conclusao: toIso(td.date)||null, ordem: ++idx
      }, token);
    }
    idx++;
  }
};

// ============================================================
//  SALVAR HISTÓRICO
// ============================================================
const _saveHistoryOriginal = window.saveHistory;
window.saveHistory = async function(h) {
  if (_saveHistoryOriginal) _saveHistoryOriginal(h);
  if (!currentProject) return;
  const token = CURRENT_USER?.access_token;
  const fase  = RAW.f1.includes(currentProject) ? 1 : 2;
  const uuid  = currentProject._uuid || await getProjectUuid(currentProject.c, fase);
  if (!uuid) return;
  await sbDelete('history', `project_id=eq.${uuid}`, token);
  for (const entry of (h[currentProjectId]||[])) {
    await sbPost('history', {
      project_id: uuid, data_registro: entry.date||new Date().toISOString().split('T')[0],
      descricao: entry.text||'', autor: CURRENT_USER?.nome||''
    }, token);
  }
};

// ============================================================
//  CRIAR PROJETO
// ============================================================
const _createProjectOriginal = window.createProject;
window.createProject = async function() {
  if (_createProjectOriginal) _createProjectOriginal();
  await new Promise(r => setTimeout(r, 150));
  const fase = parseInt(document.getElementById('nf-fase')?.value) || phase;
  const arr  = fase === 1 ? RAW.f1 : RAW.f2;
  const novo = arr[arr.length - 1];
  if (!novo) return;
  const token = CURRENT_USER?.access_token;
  const res = await sbPost('projects', {
    cliente: novo.c, fase, consultor: novo.cons||'', pacote: novo.pkg||'P',
    status: novo.st||'NÃO INICIADO', prazo: novo.prazo||'',
    atividade_atual: novo.atv||'', responsavel_tarefa: novo.blk||'', suporte: novo.sus||'',
    act_ambiente:'', act_acesso:'', act_planilha:'', act_hmg:'',
    act_validacao:'', act_prd:'', act_dif:'', act_nfse:'',
    ultima_atualizacao: novo.upd||''
  }, token);
  if (res && res[0]) { novo._uuid = res[0].id; PROJECT_ID_CACHE[novo.c+'_f'+fase] = res[0].id; }
};

// ============================================================
//  EXCLUIR PROJETO
// ============================================================
const _confirmDeleteOriginal = window.confirmDeleteCard;
window.confirmDeleteCard = async function() {
  const allP = [...RAW.f1, ...RAW.f2];
  const proj  = allP.find(p => projectId(p) === _deletePid);
  const fase  = RAW.f1.includes(proj) ? 1 : 2;
  if (_confirmDeleteOriginal) _confirmDeleteOriginal();
  if (proj) {
    const uuid = proj._uuid || await getProjectUuid(proj.c, fase);
    if (uuid) await sbPatch('projects', `id=eq.${uuid}`, { deleted_at: new Date().toISOString() }, CURRENT_USER?.access_token);
  }
};

// ============================================================
//  OVERLAYS
// ============================================================
function showLoadingOverlay(show) {
  let el = document.getElementById('sb-loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sb-loading-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(8,20,32,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9998;gap:16px;font-family:Inter,sans-serif;';
    el.innerHTML = `<div style="width:48px;height:48px;border:3px solid #1e3d5c;border-top-color:#00c4cc;border-radius:50%;animation:sb-spin .8s linear infinite"></div>
      <div style="color:#00c4cc;font-size:14px;font-weight:600">Carregando dados...</div>
      <style>@keyframes sb-spin{to{transform:rotate(360deg)}}</style>`;
    document.body.appendChild(el);
  }
  el.style.display = show ? 'flex' : 'none';
}

function showSyncIndicator() {
  let el = document.getElementById('sb-sync-dot');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sb-sync-dot';
    el.style.cssText = 'position:fixed;bottom:16px;left:16px;background:#0d1f30;border:1px solid #00c4cc44;border-radius:20px;padding:5px 12px;font-size:11px;font-weight:600;color:#00c4cc;display:flex;align-items:center;gap:6px;z-index:500;opacity:0;transition:opacity .3s;pointer-events:none;';
    el.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#00c4cc;animation:sb-pulse 1s ease-in-out infinite"></span>Salvando…<style>@keyframes sb-pulse{0%,100%{opacity:1}50%{opacity:.3}}</style>`;
    document.body.appendChild(el);
  }
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// ============================================================
//  INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await new Promise(r => setTimeout(r, 150));

  // Tenta restaurar sessão existente
  try {
    const sessao = sessionStorage.getItem('kanban_session');
    if (sessao) {
      CURRENT_USER = JSON.parse(sessao);
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + CURRENT_USER.access_token }
      });
      if (res.ok) { await iniciarApp(); return; }
    }
  } catch(e) {}

  // Sem sessão — mostra login
  mostrarTelaLogin();
});
