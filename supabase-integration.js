// ============================================================
//  supabase-integration.js
//  Integração do Kanban Reforma Tributária com o Supabase
//  Adicione esta tag no seu HTML, logo antes de </body>:
//  <script src="supabase-integration.js"></script>
// ============================================================

const SUPABASE_URL = 'https://vxeoabwqkzfdwsatuvqf.supabase.co';

const SUPABASE_KEY = 'sb_publishable_H47gHBW02AOIdECpaPiY0A_N1Bmd6H6';  

const SB_HEADERS = {
  'Content-Type':  'application/json',
  'apikey':        SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Prefer':        'return=representation'
};

// ── Cache de IDs: cliente+fase → uuid do Supabase ───────────
const PROJECT_ID_CACHE = {};

// ── Helpers HTTP ─────────────────────────────────────────────
async function sbGet(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SB_HEADERS });
  return res.ok ? res.json() : [];
}

async function sbPatch(table, query, body) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: SB_HEADERS,
    body: JSON.stringify(body)
  });
}

async function sbPost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(body)
  });
  return res.ok ? res.json() : null;
}

async function sbDelete(table, query) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: SB_HEADERS
  });
}

// ── Busca o UUID do projeto no Supabase ──────────────────────
async function getProjectUuid(cliente, fase) {
  const chave = cliente + '_f' + fase;
  if (PROJECT_ID_CACHE[chave]) return PROJECT_ID_CACHE[chave];
  const rows = await sbGet('projects', `cliente=eq.${encodeURIComponent(cliente)}&fase=eq.${fase}&select=id`);
  if (rows && rows[0]) {
    PROJECT_ID_CACHE[chave] = rows[0].id;
    return rows[0].id;
  }
  return null;
}

// ── Converte data DD/MM/AAAA → AAAA-MM-DD ───────────────────
function toIso(str) {
  if (!str) return null;
  if (str.includes('-')) return str;
  const [d, m, y] = str.split('/');
  return (d && m && y) ? `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` : null;
}

// ============================================================
//  CARREGAR DADOS DO SUPABASE NO INÍCIO
//  Substitui o applyStoredEdits() + loadNewProjects()
// ============================================================
async function carregarDadosDoSupabase() {
  console.log('🔄 Carregando dados do Supabase...');
  showLoadingOverlay(true);

  try {
    // Busca todos os projetos com suas tarefas
    const projects = await sbGet('projects', 'select=*,tasks(*)&deleted_at=is.null&order=cliente.asc');

    if (!projects || projects.length === 0) {
      console.warn('⚠ Nenhum projeto encontrado no Supabase.');
      showLoadingOverlay(false);
      return;
    }

    // Limpa os arrays em memória e repopula com dados do banco
    RAW.f1 = [];
    RAW.f2 = [];

    projects.forEach(proj => {
      // Monta o objeto no formato que a app espera
      const p = {
        c:    proj.cliente,
        cons: proj.consultor,
        pkg:  proj.pacote,
        st:   proj.status,
        prazo: proj.prazo,
        atv:  proj.atividade_atual,
        blk:  proj.responsavel_tarefa,
        sus:  proj.suporte,
        upd:  proj.ultima_atualizacao,
        acts: {
          amb:  proj.act_ambiente,
          ac:   proj.act_acesso,
          pl:   proj.act_planilha,
          hmg:  proj.act_hmg,
          val:  proj.act_validacao,
          prd:  proj.act_prd,
          dif:  proj.act_dif,
          nfse: proj.act_nfse,
        },
        _uuid: proj.id  // guardamos o uuid para usar nos updates
      };

      // Monta as tarefas no formato que a app espera
      if (proj.tasks && proj.tasks.length > 0) {
        const tasksObj = {};
        proj.tasks.forEach(t => {
          tasksObj[t.task_key] = {
            status: t.status || '',
            resp:   t.responsavel || '',
            date:   t.data_conclusao || ''
          };
          // Guarda o label de tarefas customizadas
          if (t.is_custom) tasksObj[t.task_key]._label = t.label;
        });

        if (proj.fase === 1) p.tasks  = tasksObj;
        if (proj.fase === 2) p.tasks2 = tasksObj;
      }

      // Popula cache de IDs
      PROJECT_ID_CACHE[proj.cliente + '_f' + proj.fase] = proj.id;

      // Adiciona ao array correto
      if (proj.fase === 1) RAW.f1.push(p);
      if (proj.fase === 2) RAW.f2.push(p);
    });

    console.log(`✅ ${RAW.f1.length} projetos F1 e ${RAW.f2.length} projetos F2 carregados.`);

  } catch(e) {
    console.error('❌ Erro ao carregar dados:', e);
  }

  showLoadingOverlay(false);
  render(); // redesenha o board com os dados do banco
}

// ============================================================
//  SALVAR ALTERAÇÕES DE UM PROJETO NO SUPABASE
//  Sobrescreve o persistProjectState() original
// ============================================================
const _persistOriginal = window.persistProjectState;

window.persistProjectState = async function(p) {
  // Mantém o localStorage funcionando como fallback
  if (_persistOriginal) _persistOriginal(p);

  const uuid = p._uuid || await getProjectUuid(p.c, p._fase || (RAW.f1.includes(p) ? 1 : 2));
  if (!uuid) { console.warn('⚠ UUID não encontrado para', p.c); return; }

  const fase = RAW.f1.includes(p) ? 1 : 2;

  // Atualiza o projeto
  await sbPatch('projects', `id=eq.${uuid}`, {
    consultor:          p.cons || '',
    pacote:             p.pkg  || 'P',
    status:             p.st   || '',
    prazo:              p.prazo || '',
    atividade_atual:    p.atv  || '',
    responsavel_tarefa: p.blk  || '',
    suporte:            p.sus  || '',
    act_ambiente:       (p.acts||{}).amb  || '',
    act_acesso:         (p.acts||{}).ac   || '',
    act_planilha:       (p.acts||{}).pl   || '',
    act_hmg:            (p.acts||{}).hmg  || '',
    act_validacao:      (p.acts||{}).val  || '',
    act_prd:            (p.acts||{}).prd  || '',
    act_dif:            (p.acts||{}).dif  || '',
    act_nfse:           (p.acts||{}).nfse || '',
    ultima_atualizacao: p.upd || '',
    updated_at:         new Date().toISOString()
  });

  // Atualiza as tarefas
  const tasksObj = fase === 1 ? (p.tasks || {}) : (p.tasks2 || {});
  const listaBase = fase === 1 ? F1_TASKS : F2_TASKS;

  for (const [key, td] of Object.entries(tasksObj)) {
    const isCustom = key.startsWith('cx_') || key.startsWith('cx2_');
    const base  = listaBase.find(t => t.k === key);
    const label = isCustom ? (td._label || key) : (base ? base.label : key);

    // Tenta atualizar; se não existir, insere
    const existing = await sbGet('tasks', `project_id=eq.${uuid}&task_key=eq.${key}&select=id`);
    if (existing && existing[0]) {
      await sbPatch('tasks', `id=eq.${existing[0].id}`, {
        status:         td.status || '',
        responsavel:    td.resp   || '',
        data_conclusao: toIso(td.date) || null,
        updated_at:     new Date().toISOString()
      });
    } else {
      await sbPost('tasks', {
        project_id:     uuid,
        task_key:       key,
        label:          label,
        is_custom:      isCustom,
        status:         td.status || '',
        responsavel:    td.resp   || '',
        data_conclusao: toIso(td.date) || null,
        ordem:          Object.keys(tasksObj).indexOf(key) + 1
      });
    }
  }
};

// ============================================================
//  SALVAR HISTÓRICO NO SUPABASE
//  Sobrescreve o saveHistory() original
// ============================================================
const _saveHistoryOriginal = window.saveHistory;

window.saveHistory = async function(h) {
  // Mantém localStorage como fallback
  if (_saveHistoryOriginal) _saveHistoryOriginal(h);

  if (!currentProject) return;
  const uuid = currentProject._uuid || await getProjectUuid(currentProject.c, RAW.f1.includes(currentProject) ? 1 : 2);
  if (!uuid) return;

  // Apaga histórico antigo e reinsere tudo (mais simples que diff)
  await sbDelete('history', `project_id=eq.${uuid}`);

  const entries = h[currentProjectId] || [];
  for (const entry of entries) {
    await sbPost('history', {
      project_id:    uuid,
      data_registro: entry.date || new Date().toISOString().split('T')[0],
      descricao:     entry.text || '',
      autor:         ''
    });
  }
};

// ============================================================
//  CRIAR NOVO PROJETO NO SUPABASE
//  Sobrescreve o createProject() original
// ============================================================
const _createProjectOriginal = window.createProject;

window.createProject = async function() {
  // Executa a lógica original (valida campos, adiciona ao RAW, etc.)
  if (_createProjectOriginal) _createProjectOriginal();

  // Após a criação, pega o projeto recém-adicionado e salva no Supabase
  await new Promise(r => setTimeout(r, 100)); // aguarda o original terminar

  const fase = parseInt(document.getElementById('nf-fase')?.value) || phase;
  const arr   = fase === 1 ? RAW.f1 : RAW.f2;
  const novo  = arr[arr.length - 1]; // último adicionado
  if (!novo) return;

  const res = await sbPost('projects', {
    cliente:            novo.c,
    fase:               fase,
    consultor:          novo.cons || '',
    pacote:             novo.pkg  || 'P',
    status:             novo.st   || 'NÃO INICIADO',
    prazo:              novo.prazo || '',
    atividade_atual:    novo.atv  || '',
    responsavel_tarefa: novo.blk  || '',
    suporte:            novo.sus  || '',
    act_ambiente: '', act_acesso: '', act_planilha: '', act_hmg: '',
    act_validacao: '', act_prd: '', act_dif: '', act_nfse: '',
    ultima_atualizacao: novo.upd || ''
  });

  if (res && res[0]) {
    novo._uuid = res[0].id;
    PROJECT_ID_CACHE[novo.c + '_f' + fase] = res[0].id;
    console.log(`✅ Novo projeto "${novo.c}" criado no Supabase.`);
  }
};

// ============================================================
//  EXCLUIR PROJETO NO SUPABASE
//  Sobrescreve o confirmDeleteCard() original
// ============================================================
const _confirmDeleteOriginal = window.confirmDeleteCard;

window.confirmDeleteCard = async function() {
  if (!_deletePid) return;

  // Encontra o projeto antes de deletar
  const allP = [...RAW.f1, ...RAW.f2];
  const proj  = allP.find(p => projectId(p) === _deletePid);
  const fase  = RAW.f1.includes(proj) ? 1 : 2;

  // Executa a lógica original (remove do RAW, fecha modal, etc.)
  if (_confirmDeleteOriginal) _confirmDeleteOriginal();

  // Soft delete no Supabase
  if (proj) {
    const uuid = proj._uuid || await getProjectUuid(proj.c, fase);
    if (uuid) {
      await sbPatch('projects', `id=eq.${uuid}`, {
        deleted_at: new Date().toISOString()
      });
      console.log(`🗑️ Projeto "${proj.c}" marcado como excluído no Supabase.`);
    }
  }
};

// ============================================================
//  OVERLAY DE CARREGAMENTO
// ============================================================
function showLoadingOverlay(show) {
  let el = document.getElementById('sb-loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sb-loading-overlay';
    el.style.cssText = `
      position:fixed;inset:0;background:rgba(8,20,32,.92);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      z-index:9999;gap:16px;font-family:'Inter',sans-serif;
    `;
    el.innerHTML = `
      <div style="width:48px;height:48px;border:3px solid #1e3d5c;border-top-color:#00c4cc;
        border-radius:50%;animation:sb-spin 0.8s linear infinite;"></div>
      <div style="color:#00c4cc;font-size:14px;font-weight:600;">Carregando dados...</div>
      <style>@keyframes sb-spin{to{transform:rotate(360deg)}}</style>
    `;
    document.body.appendChild(el);
  }
  el.style.display = show ? 'flex' : 'none';
}

// ============================================================
//  INDICADOR DE SINCRONIZAÇÃO (aparece ao salvar)
// ============================================================
function showSyncIndicator() {
  let el = document.getElementById('sb-sync-dot');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sb-sync-dot';
    el.style.cssText = `
      position:fixed;bottom:16px;left:16px;
      background:#0d1f30;border:1px solid #00c4cc44;
      border-radius:20px;padding:5px 12px;
      font-size:11px;font-weight:600;color:#00c4cc;
      display:flex;align-items:center;gap:6px;
      z-index:500;opacity:0;transition:opacity .3s;
    `;
    el.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#00c4cc;
      animation:sb-pulse 1s ease-in-out infinite"></span> Salvando no Supabase…
      <style>@keyframes sb-pulse{0%,100%{opacity:1}50%{opacity:.3}}</style>`;
    document.body.appendChild(el);
  }
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// Intercepta o persistProjectState para mostrar o indicador
const _persistWithIndicator = window.persistProjectState;
window.persistProjectState = async function(p) {
  showSyncIndicator();
  await _persistWithIndicator(p);
};

// ============================================================
//  INICIALIZAÇÃO — substitui o INIT original do HTML
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Aguarda o HTML terminar de executar o init original
  await new Promise(r => setTimeout(r, 200));

  // Carrega dados frescos do Supabase (sobrescreve o que estava no RAW hardcoded)
  await carregarDadosDoSupabase();
});
