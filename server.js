'use strict';
/**
 * Carreira em Foco - servidor (Node.js 22+ com SQLite embutido, sem dependências externas).
 * Variáveis de ambiente:
 *   PORT           porta HTTP (padrão 3000)
 *   DB_PATH        caminho do arquivo SQLite (padrão ./data/carreira.db)
 *   ADMIN_EMAILS   e-mails (separados por vírgula) que viram "coordenacao" ao se cadastrar
 *   NODE_ENV       use "production" atrás de HTTPS para cookies seguros
 */
const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'carreira.db');
const PROD = process.env.NODE_ENV === 'production';
const ADMINS = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const SESSION_DAYS = 14;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_ALLOWED_DOMAIN = (process.env.GOOGLE_ALLOWED_DOMAIN || '').toLowerCase().replace(/^@/, '');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
// Garantir admin/coordenacao de forma segura via Variáveis de Ambiente
try {
    const adminEmail = process.env.ADMIN_EMAIL || 'let491923@gmail.com';
    const senhaAdmin = process.env.ADMIN_PASSWORD; 
    
    if (senhaAdmin) {
        const crypto = require('node:crypto');
        const checkAdmin = db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail);
        
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(senhaAdmin, salt, 64).toString('hex');

        if (!checkAdmin) {
            db.prepare(`
                INSERT INTO users (nome, email, senha_hash, senha_salt, curso, semestre, area, role)
                VALUES (?, ?, ?, ?, 'Administração', '1° semestre', 'Geral', 'coordenacao')
            `).run('Coordenador', adminEmail, hash, salt);
        } else {
            db.prepare("UPDATE users SET role='coordenacao', senha_hash=?, senha_salt=? WHERE email=?").run(hash, salt, adminEmail);
        }
    }
} catch (e) {
    console.log("Erro ao configurar admin:", e.message);
}

/* ---------- utilidades ---------- */
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const hash = (senha, salt) => crypto.scryptSync(senha, salt, 64).toString('hex');
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const dateOk = d => d === '' || /^\d{4}-\d{2}-\d{2}$/.test(d);

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function setSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions(token,user_id,expira_em) VALUES (?,?,?)').run(token, userId, exp);
  res.setHeader('Set-Cookie', `cef=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${PROD ? '; Secure' : ''}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `cef=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${PROD ? '; Secure' : ''}`);
}
function publicUser(u) {
  return { nome: u.nome, email: u.email, admin: u.role === 'coordenacao' };
}

/* limitador simples de tentativas de login (em memória) */
const tentativas = new Map();
function limitado(chave) {
  const agora = Date.now();
  const lst = (tentativas.get(chave) || []).filter(t => agora - t < 15 * 60e3);
  tentativas.set(chave, lst);
  return lst.length >= 10;
}
function falhou(chave) { const l = tentativas.get(chave) || []; l.push(Date.now()); tentativas.set(chave, l); }

const EVENTOS_OK = new Set(['tela', 'objetivo_criado', 'tarefa_criada', 'tarefa_concluida', 'competencia_adicionada',
  'modelo_usado', 'oportunidade_aberta', 'oportunidade_tarefa', 'avaliacao_nota']);
function evento(userId, tipo, detalhe) {
  try { db.prepare('INSERT INTO eventos(user_id,tipo,detalhe) VALUES (?,?,?)').run(userId || null, tipo, str(detalhe, 80)); } catch (e) { console.error(e); }
}

/* ---------- helpers HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 1e6) { reject(new Error('grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function currentUser(req) {
  const token = parseCookies(req).cef;
  if (!token) return null;
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expira_em > ?')
    .get(token, new Date().toISOString()) || null;
}
function transaction(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/* ---------- rotas ---------- */
function registrar(req, res, b) {
  const nome = str(b.nome, 100), email = str(b.email, 160).toLowerCase();
  const curso = str(b.curso, 120), semestre = str(b.semestre, 40), senha = String(b.senha || '');
  if (nome.length < 2) return send(res, 400, { erro: 'Informe seu nome.' });
  if (!emailOk(email)) return send(res, 400, { erro: 'Informe um e-mail válido.' });
  if (senha.length < 8) return send(res, 400, { erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  if (!curso) return send(res, 400, { erro: 'Informe seu curso.' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return send(res, 409, { erro: 'Este e-mail já tem cadastro. Use "Entrar".' });
  const salt = crypto.randomBytes(16).toString('hex');
  const role = ADMINS.includes(email) ? 'coordenacao' : 'aluno';
  const info = db.prepare('INSERT INTO users(nome,email,senha_hash,senha_salt,curso,semestre,role) VALUES (?,?,?,?,?,?,?)')
    .run(nome, email, hash(senha, salt), salt, curso, semestre, role);
  setSession(res, Number(info.lastInsertRowid));
  evento(Number(info.lastInsertRowid), 'cadastro', 'senha');
  send(res, 200, { usuario: { nome, email, admin: role === 'coordenacao' } });
}

function entrar(req, res, b) {
  const email = str(b.email, 160).toLowerCase(), senha = String(b.senha || '');
  const chave = req.socket.remoteAddress + '|' + email;
  if (limitado(chave)) return send(res, 429, { erro: 'Muitas tentativas. Aguarde alguns minutos.' });
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  const ok = u && crypto.timingSafeEqual(Buffer.from(hash(senha, u.senha_salt), 'hex'), Buffer.from(u.senha_hash, 'hex'));
  if (!ok) { falhou(chave); return send(res, 401, { erro: 'E-mail ou senha incorretos.' }); }
  setSession(res, u.id);
  evento(u.id, 'login', 'senha');
  send(res, 200, { usuario: publicUser(u) });
}

/* login com Google: valida o token de identidade no Google e cria a conta no primeiro acesso */
async function entrarGoogle(req, res, b) {
  if (!GOOGLE_CLIENT_ID) return send(res, 503, { erro: 'Login com Google não está configurado.' });
  const credential = String(b.credential || '');
  if (!credential) return send(res, 400, { erro: 'Token ausente.' });
  let info;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
    info = await r.json();
    if (!r.ok) throw new Error('token');
  } catch (e) { return send(res, 401, { erro: 'Não foi possível validar sua conta Google. Tente de novo.' }); }
  const email = str(info.email, 160).toLowerCase();
  const okIss = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  if (info.aud !== GOOGLE_CLIENT_ID || !okIss || String(info.email_verified) !== 'true' || !emailOk(email) || Number(info.exp) * 1000 < Date.now())
    return send(res, 401, { erro: 'Conta Google não validada.' });
  if (GOOGLE_ALLOWED_DOMAIN && !email.endsWith('@' + GOOGLE_ALLOWED_DOMAIN))
    return send(res, 403, { erro: 'Use sua conta @' + GOOGLE_ALLOWED_DOMAIN + ' para entrar.' });
  let u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  let novo = false;
  if (!u) {
    const salt = crypto.randomBytes(16).toString('hex');
    const role = ADMINS.includes(email) ? 'coordenacao' : 'aluno';
    const ins = db.prepare('INSERT INTO users(nome,email,senha_hash,senha_salt,role) VALUES (?,?,?,?,?)')
      .run(str(info.name, 100) || email.split('@')[0], email, hash(crypto.randomBytes(24).toString('hex'), salt), salt, role);
    u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(ins.lastInsertRowid));
    novo = true;
  }
  setSession(res, u.id);
  evento(u.id, novo ? 'cadastro' : 'login_google', 'google');
  if (novo) evento(u.id, 'login_google', 'google');
  send(res, 200, { usuario: publicUser(u) });
}

function estado(req, res, u) {
  const id = u.id;
  const fb = db.prepare('SELECT * FROM feedback WHERE user_id=?').get(id);
  const un = x => String(x).replace(/:\d+$/, '');
  send(res, 200, {
    profile: { nome: u.nome, curso: u.curso, semestre: u.semestre, area: u.area },
    skills: db.prepare('SELECT id, tipo AS kind, nome, nivel FROM skills WHERE user_id=? ORDER BY rowid').all(id).map(r => ({ ...r, id: un(r.id) })),
    goals: db.prepare('SELECT id, titulo, prazo, data FROM goals WHERE user_id=? ORDER BY rowid').all(id).map(r => ({ ...r, id: un(r.id) })),
    tasks: db.prepare('SELECT id, goal_id AS goalId, titulo, data, status FROM tasks WHERE user_id=? ORDER BY rowid').all(id).map(r => ({ ...r, id: un(r.id), goalId: un(r.goalId) })),
    feedback: fb ? { util: fb.util, facil: fb.facil, voltar: fb.voltar, texto: fb.comentario } : { texto: '' }
  });
}

function salvar(id, s) {
  transaction(() => {
    const p = s.profile || {};
    db.prepare(`UPDATE users SET nome=?, curso=?, semestre=?, area=?, atualizado_em=datetime('now') WHERE id=?`)
      .run(str(p.nome, 100) || 'Estudante', str(p.curso, 120), str(p.semestre, 40), str(p.area, 120), id);
    db.prepare('DELETE FROM tasks WHERE user_id=?').run(id);
    db.prepare('DELETE FROM goals WHERE user_id=?').run(id);
    db.prepare('DELETE FROM skills WHERE user_id=?').run(id);
    const ids = new Set();
    const insG = db.prepare('INSERT INTO goals(id,user_id,titulo,prazo,data) VALUES (?,?,?,?,?)');
    (Array.isArray(s.goals) ? s.goals : []).slice(0, 200).forEach(g => {
      const gid = str(g.id, 40) + ':' + id;
      if (!g.id || ids.has(gid)) return;
      ids.add(gid);
      insG.run(gid, id, str(g.titulo, 160) || 'Objetivo', ['curto', 'medio', 'longo'].includes(g.prazo) ? g.prazo : 'curto', dateOk(g.data || '') ? (g.data || '') : '');
    });
    const insT = db.prepare('INSERT INTO tasks(id,user_id,goal_id,titulo,data,status) VALUES (?,?,?,?,?,?)');
    (Array.isArray(s.tasks) ? s.tasks : []).slice(0, 1000).forEach(t => {
      const gid = str(t.goalId, 40) + ':' + id;
      if (!t.id || !ids.has(gid)) return;
      insT.run(str(t.id, 40) + ':' + id, id, gid, str(t.titulo, 160) || 'Tarefa', dateOk(t.data || '') ? (t.data || '') : '', ['todo', 'doing', 'done'].includes(t.status) ? t.status : 'todo');
    });
    const insS = db.prepare('INSERT INTO skills(id,user_id,tipo,nome,nivel) VALUES (?,?,?,?,?)');
    (Array.isArray(s.skills) ? s.skills : []).slice(0, 100).forEach(k => {
      if (!k.id) return;
      insS.run(str(k.id, 40) + ':' + id, id, k.kind === 'desenvolver' ? 'desenvolver' : 'forte', str(k.nome, 60) || 'Competência', Math.min(5, Math.max(1, parseInt(k.nivel, 10) || 1)));
    });
    const f = s.feedback || {};
    const n = v => Math.min(5, Math.max(0, parseInt(v, 10) || 0));
    db.prepare(`INSERT INTO feedback(user_id,util,facil,voltar,comentario,atualizado_em) VALUES (?,?,?,?,?,datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET util=excluded.util, facil=excluded.facil, voltar=excluded.voltar, comentario=excluded.comentario, atualizado_em=excluded.atualizado_em`)
      .run(id, n(f.util), n(f.facil), n(f.voltar), str(f.texto, 1000));
  });
}

/* coordenação: dados agregados, sem nome nem e-mail */
const SQL_RESUMO = `
  SELECT u.curso, u.semestre,
    (SELECT COUNT(*) FROM goals g WHERE g.user_id=u.id) AS objetivos,
    (SELECT COUNT(*) FROM tasks t WHERE t.user_id=u.id) AS tarefas,
    (SELECT COUNT(*) FROM tasks t WHERE t.user_id=u.id AND t.status='done') AS concluidas,
    (SELECT COUNT(*) FROM tasks t WHERE t.user_id=u.id AND t.status<>'done' AND t.data<>'' AND t.data < date('now')) AS atrasadas,
    COALESCE(f.util,0) AS util, COALESCE(f.facil,0) AS facil, COALESCE(f.voltar,0) AS voltar,
    COALESCE(f.comentario,'') AS comentario, u.atualizado_em AS atualizado
  FROM users u LEFT JOIN feedback f ON f.user_id=u.id
  WHERE u.role='aluno' ORDER BY u.criado_em`;

function atividade() {
  const por_dia = db.prepare(`SELECT date(criado_em) AS dia, COUNT(*) AS acessos, COUNT(DISTINCT user_id) AS usuarios
    FROM eventos WHERE tipo IN ('login','login_google') AND criado_em >= datetime('now','-14 days')
    GROUP BY dia ORDER BY dia`).all();
  const por_tela = db.prepare(`SELECT detalhe, COUNT(*) AS n FROM eventos WHERE tipo='tela' GROUP BY detalhe ORDER BY n DESC LIMIT 10`).all();
  const por_acao = db.prepare(`SELECT tipo, CASE WHEN tipo IN ('oportunidade_aberta','oportunidade_tarefa') THEN detalhe ELSE '' END AS detalhe, COUNT(*) AS n
    FROM eventos WHERE tipo<>'tela' GROUP BY tipo, detalhe ORDER BY n DESC LIMIT 12`).all();
  return { por_dia, por_tela, por_acao };
}

function exportarCsv(res) {
  const rows = db.prepare(SQL_RESUMO).all();
  const cols = ['curso', 'semestre', 'objetivos', 'tarefas', 'concluidas', 'atrasadas', 'util', 'facil', 'voltar', 'comentario', 'atualizado'];
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = '﻿' + cols.join(';') + '\n' + rows.map(r => cols.map(c => cell(r[c])).join(';')).join('\n');
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="carreira-em-foco-resumo.csv"' });
  res.end(csv);
}

const PUBLIC = path.join(__dirname, 'public');
function estatico(req, res, pathname) {
  if (pathname === '/favicon.ico') pathname = '/favicon.svg';
  let file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  let code = 200;
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { file = path.join(PUBLIC, 'index.html'); code = 404; }
  res.writeHead(code, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (!pathname.startsWith('/api/')) return estatico(req, res, pathname);
    const m = req.method;
    if (m === 'GET' && pathname === '/api/config') return send(res, 200, { googleClientId: GOOGLE_CLIENT_ID });
    if (m === 'POST' && pathname === '/api/google') return await entrarGoogle(req, res, await readBody(req));
    if (m === 'POST' && pathname === '/api/registrar') return registrar(req, res, await readBody(req));
    if (m === 'POST' && pathname === '/api/entrar') return entrar(req, res, await readBody(req));
    if (m === 'POST' && pathname === '/api/sair') {
      const token = parseCookies(req).cef;
      if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
      clearSession(res);
      return send(res, 200, { ok: true });
    }
    const u = currentUser(req);
    if (!u) return send(res, 401, { erro: 'Entre para continuar.' });
    if (m === 'GET' && pathname === '/api/eu') return send(res, 200, { usuario: publicUser(u) });
    if (m === 'GET' && pathname === '/api/estado') return estado(req, res, u);
    if (m === 'POST' && pathname === '/api/evento') {
      const b = await readBody(req);
      if (EVENTOS_OK.has(b.tipo)) evento(u.id, b.tipo, b.detalhe);
      return send(res, 200, { ok: true });
    }
    if (m === 'PUT' && pathname === '/api/estado') { salvar(u.id, await readBody(req)); return send(res, 200, { ok: true }); }
    if (pathname.startsWith('/api/admin/')) {
      if (u.role !== 'coordenacao') return send(res, 403, { erro: 'Acesso restrito à coordenação.' });
      if (m === 'GET' && pathname === '/api/admin/resumo') return send(res, 200, { linhas: db.prepare(SQL_RESUMO).all() });
      if (m === 'GET' && pathname === '/api/admin/atividade') return send(res, 200, atividade());
      if (m === 'GET' && pathname === '/api/admin/exportar.csv') return exportarCsv(res);
    }
    send(res, 404, { erro: 'Rota não encontrada.' });
  } catch (e) {
    console.error(e);
    send(res, e instanceof SyntaxError ? 400 : 500, { erro: 'Não foi possível concluir agora.' });
  }
});

setInterval(() => db.prepare('DELETE FROM sessions WHERE expira_em < ?').run(new Date().toISOString()), 6 * 3600e3).unref();
server.listen(PORT, () => console.log(`Carreira em Foco em http://localhost:${PORT}`));
