-- Banco de dados do Carreira em Foco (SQLite)
-- Criado automaticamente na primeira execução do servidor.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  senha_hash    TEXT    NOT NULL,
  senha_salt    TEXT    NOT NULL,
  curso         TEXT    NOT NULL DEFAULT '',
  semestre      TEXT    NOT NULL DEFAULT '',
  area          TEXT    NOT NULL DEFAULT '',
  role          TEXT    NOT NULL DEFAULT 'aluno' CHECK (role IN ('aluno','coordenacao')),
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expira_em  TEXT    NOT NULL
);

-- Pontos fortes e competências a desenvolver (nível de 1 a 5)
CREATE TABLE IF NOT EXISTS skills (
  id       TEXT PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo     TEXT    NOT NULL CHECK (tipo IN ('forte','desenvolver')),
  nome     TEXT    NOT NULL,
  nivel    INTEGER NOT NULL DEFAULT 1 CHECK (nivel BETWEEN 1 AND 5)
);

-- Objetivos de curto, médio e longo prazo
CREATE TABLE IF NOT EXISTS goals (
  id       TEXT PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titulo   TEXT    NOT NULL,
  prazo    TEXT    NOT NULL CHECK (prazo IN ('curto','medio','longo')),
  data     TEXT    NOT NULL DEFAULT ''
);

-- Tarefas do plano de ação, ligadas a um objetivo
CREATE TABLE IF NOT EXISTS tasks (
  id       TEXT PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id  TEXT    NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  titulo   TEXT    NOT NULL,
  data     TEXT    NOT NULL DEFAULT '',
  status   TEXT    NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done'))
);

-- Avaliação do sistema pelo estudante (uma por usuário)
CREATE TABLE IF NOT EXISTS feedback (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  util          INTEGER NOT NULL DEFAULT 0,
  facil         INTEGER NOT NULL DEFAULT 0,
  voltar        INTEGER NOT NULL DEFAULT 0,
  comentario    TEXT    NOT NULL DEFAULT '',
  atualizado_em TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_skills_user ON skills(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user  ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user  ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_goal  ON tasks(goal_id);

-- Registro de interações (telas visitadas, ações, logins) para a coordenação
CREATE TABLE IF NOT EXISTS eventos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  tipo       TEXT NOT NULL,
  detalhe    TEXT NOT NULL DEFAULT '',
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_eventos_data ON eventos(criado_em);
CREATE INDEX IF NOT EXISTS idx_eventos_tipo ON eventos(tipo);

-- Redefinição de senha: guarda só o hash do token (o token vai por e-mail ou pelo link da coordenação)
CREATE TABLE IF NOT EXISTS resets (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expira_em  TEXT NOT NULL
);

-- Pedidos de mentoria feitos pelos estudantes e respondidos pela coordenação
CREATE TABLE IF NOT EXISTS mentorias (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tema          TEXT NOT NULL,
  mensagem      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','andamento','concluida')),
  resposta      TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mentorias_user ON mentorias(user_id);

-- Vagas, cursos e eventos cadastrados pela coordenação
CREATE TABLE IF NOT EXISTS vagas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo       TEXT NOT NULL CHECK (tipo IN ('Estágio','Vaga','Curso','Evento')),
  titulo     TEXT NOT NULL,
  empresa    TEXT NOT NULL DEFAULT '',
  descricao  TEXT NOT NULL DEFAULT '',
  link       TEXT NOT NULL DEFAULT '',
  prazo      TEXT NOT NULL DEFAULT '',
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
