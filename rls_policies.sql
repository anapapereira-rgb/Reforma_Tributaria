-- ============================================================
--  RLS (Row Level Security) — Kanban Reforma Tributária
--  Executar no Supabase Dashboard → SQL Editor
--
--  Lógica de perfil:
--    • gerente  → acesso total (SELECT / INSERT / UPDATE / DELETE)
--    • consultor → SELECT e UPDATE apenas nos próprios projetos
--                  (projects.consultor = primeiro segmento do e-mail Auth)
-- ============================================================

-- ── 1. TABELA: projects ──────────────────────────────────────

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Gerente: acesso irrestrito
CREATE POLICY "gerente_full_projects"
  ON projects
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'perfil' = 'gerente'
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'perfil' = 'gerente'
  );

-- Consultor: SELECT apenas nos projetos onde é responsável
CREATE POLICY "consultor_select_own_projects"
  ON projects
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'perfil' = 'consultor'
    AND
    consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
  );

-- Consultor: UPDATE apenas nos projetos onde é responsável
CREATE POLICY "consultor_update_own_projects"
  ON projects
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'perfil' = 'consultor'
    AND
    consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
  )
  WITH CHECK (
    -- Impede que o consultor reatribua o projeto para outro consultor
    consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
  );

-- Consultor: sem permissão de INSERT nem DELETE
-- (ausência de política = negado pelo RLS)


-- ── 2. TABELA: tasks ─────────────────────────────────────────

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Gerente: acesso irrestrito
CREATE POLICY "gerente_full_tasks"
  ON tasks
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'perfil' = 'gerente'
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'perfil' = 'gerente'
  );

-- Consultor: SELECT nas tasks dos próprios projetos (via join)
CREATE POLICY "consultor_select_own_tasks"
  ON tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = tasks.project_id
        AND p.consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
    )
  );

-- Consultor: UPDATE nas tasks dos próprios projetos
CREATE POLICY "consultor_update_own_tasks"
  ON tasks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = tasks.project_id
        AND p.consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
    )
  );

-- Consultor: INSERT de tasks customizadas nos próprios projetos
CREATE POLICY "consultor_insert_own_tasks"
  ON tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = tasks.project_id
        AND p.consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
    )
  );


-- ── 3. TABELA: history ───────────────────────────────────────

ALTER TABLE history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gerente_full_history"
  ON history
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'perfil' = 'gerente')
  WITH CHECK ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'perfil' = 'gerente');

CREATE POLICY "consultor_select_own_history"
  ON history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = history.project_id
        AND p.consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
    )
  );

CREATE POLICY "consultor_insert_own_history"
  ON history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = history.project_id
        AND p.consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
    )
  );


-- ── 4. TABELA: client_info ───────────────────────────────────

ALTER TABLE client_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gerente_full_client_info"
  ON client_info
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'perfil' = 'gerente')
  WITH CHECK ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'perfil' = 'gerente');

CREATE POLICY "consultor_select_own_client_info"
  ON client_info
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = client_info.project_id
        AND p.consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
    )
  );

CREATE POLICY "consultor_update_own_client_info"
  ON client_info
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = client_info.project_id
        AND p.consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
    )
  );


-- ── 5. TABELA: documents ─────────────────────────────────────

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gerente_full_documents"
  ON documents
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'perfil' = 'gerente')
  WITH CHECK ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'perfil' = 'gerente');

CREATE POLICY "consultor_select_own_documents"
  ON documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = documents.project_id
        AND p.consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
    )
  );

CREATE POLICY "consultor_insert_own_documents"
  ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = documents.project_id
        AND p.consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
    )
  );

CREATE POLICY "consultor_delete_own_documents"
  ON documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = documents.project_id
        AND p.consultor = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'consultor'
    )
  );


-- ── 6. VERIFICAÇÃO: listar políticas ativas ──────────────────
-- Execute após o script para confirmar que tudo foi criado:
--
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('projects','tasks','history','client_info','documents')
-- ORDER BY tablename, cmd;
