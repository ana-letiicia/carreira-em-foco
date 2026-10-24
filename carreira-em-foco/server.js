'use strict';
/**
 * Carreira em Foco - servidor (Node.js 22+ com SQLite embutido, sem dependências externas).
 * Variáveis de ambiente:
 *   PORT           porta HTTP (padrão 3000)
 *   DB_PATH        caminho do arquivo SQLite (padrão ./data/carreira.db)
 *   ADMIN_EMAILS   e-mails (separados por vírgula) que viram "coordenacao" ao se cadastrar
 *   NODE_ENV       use "production" atrás de HTTPS para cookies seguros
 *   BASE_URL       endereço público do site (ex.: https://carreira.unifametro.edu.br); obrigatório em produção
 *                  para os e-mails de redefinição de senha e lembretes
 *   RESEND_API_KEY / EMAIL_FROM   ativam o envio de e-mails (redefinição de senha, lembretes, respostas de mentoria)
 *   GOOGLE_CLIENT_ID              ativa o login com Google
 *   MICROSOFT_CLIENT_ID / MICROSOFT_TENANT   ativam o login com Microsoft 365 (MICROSOFT_TENANT = ID do diretório da faculdade)
 *   ALLOWED_DOMAIN                limita o login por Google/Microsoft a um domínio (ex.: unifametro.edu.br)
 *   ADMIN_EMAIL / ADMIN_PASSWORD     cria (ou atualiza) a conta de coordenação inicial; use senha forte e guarde só nas variáveis do servidor
 *   TRUST_PROXY_HOPS              quantos proxies ficam na frente do servidor (padrão 1 em produção); usado para identificar o IP real
 *   LEMBRETE_HORA                 hora (0 a 23, fuso de Fortaleza) a partir da qual os lembretes diários saem (padrão 8)
 */
const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'carreira.db');
const PROD = process.env.NODE_ENV === 'production';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMINS = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
if (ADMIN_PASSWORD && ADMIN_EMAIL && !ADMINS.includes(ADMIN_EMAIL)) ADMINS.push(ADMIN_EMAIL);
const PROXY_HOPS = PROD ? Math.max(0, parseInt(process.env.TRUST_PROXY_HOPS || '1', 10) || 0) : 0;
const SESSION_DAYS = 14;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || process.env.GOOGLE_ALLOWED_DOMAIN || '').toLowerCase().replace(/^@/, '');
const BASE_URL = (process.env.BASE_URL || '').replace(/\/+$/, '');
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || '';
const EMAIL_ATIVO = !!(RESEND_API_KEY && EMAIL_FROM && (!PROD || BASE_URL));
const MS_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const MS_TENANT = (process.env.MICROSOFT_TENANT || '').toLowerCase();
const MS_ATIVO = !!(MS_CLIENT_ID && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(MS_TENANT));
const LEMBRETE_HORA = parseInt(process.env.LEMBRETE_HORA || '8', 10);
const LEMBRETE_INTERVALO = parseInt(process.env.LEMBRETE_INTERVALO_MS || '3600000', 10);
const TZ = process.env.TZ_LEMBRETE || 'America/Fortaleza';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
/* migração: colunas novas em bancos criados por versões anteriores */
(function migrar() {
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('extra')) db.exec("ALTER TABLE users ADD COLUMN extra TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('lembretes')) db.exec('ALTER TABLE users ADD COLUMN lembretes INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('lembrete_em')) db.exec('ALTER TABLE users ADD COLUMN lembrete_em TEXT');
  /* verificado = 1 quando o e-mail foi comprovado (Google, Microsoft ou conta criada pelo administrador do servidor) */
  if (!cols.includes('verificado')) db.exec('ALTER TABLE users ADD COLUMN verificado INTEGER NOT NULL DEFAULT 0');
  /* tokens de sessão passam a ser guardados só como hash: sessões antigas deixam de valer */
  if (!db.prepare('PRAGMA table_info(sessions)').all().some(c => c.name === 'v2')) {
    db.exec('DELETE FROM sessions; ALTER TABLE sessions ADD COLUMN v2 INTEGER NOT NULL DEFAULT 1');
  }
})();

/* ---------- utilidades ---------- */
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const hash = (senha, salt) => crypto.scryptSync(senha, salt, 64).toString('hex');
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const dateOk = d => d === '' || /^\d{4}-\d{2}-\d{2}$/.test(d);
const SENHA_MAX = 200;
const SENHAS_FRACAS = new Set(['12345678', '123456789', '1234567890', '87654321', 'password', 'password1', 'senha123', 'senha1234', 'qwertyui', 'qwerty123', '11111111', '00000000', 'abcd1234', 'iloveyou', 'carreira', 'unifametro']);
function senhaFraca(senha, email) {
  const l = senha.toLowerCase();
  return SENHAS_FRACAS.has(l) || l === email || /^(.)\1+$/.test(senha);
}

/* conta de coordenação inicial, definida só por variáveis de ambiente */
try {
  if (ADMIN_PASSWORD) {
    if (!ADMIN_EMAIL) console.error('Defina ADMIN_EMAIL junto com ADMIN_PASSWORD. Conta de coordenação não criada.');
    else if (ADMIN_PASSWORD.length < 10) console.error('ADMIN_PASSWORD precisa ter pelo menos 10 caracteres. Conta de coordenação não criada.');
    else {
      const existente = db.prepare('SELECT id, role, verificado, senha_hash, senha_salt FROM users WHERE email=?').get(ADMIN_EMAIL);
      if (!existente) {
        const salt = crypto.randomBytes(16).toString('hex'), h = hash(ADMIN_PASSWORD, salt);
        db.prepare("INSERT INTO users(nome,email,senha_hash,senha_salt,curso,semestre,role,verificado) VALUES ('Coordenação',?,?,?,'Coordenação','','coordenacao',1)").run(ADMIN_EMAIL, h, salt);
      } else {
        const hashAtual = Buffer.from(existente.senha_hash, 'hex');
        const hashConfigurado = Buffer.from(hash(ADMIN_PASSWORD, existente.senha_salt), 'hex');
        const senhaIgual = hashAtual.length === hashConfigurado.length && crypto.timingSafeEqual(hashAtual, hashConfigurado);
        if (existente.role !== 'coordenacao' || !existente.verificado || !senhaIgual) {
          const salt = crypto.randomBytes(16).toString('hex'), h = hash(ADMIN_PASSWORD, salt);
          transaction(() => {
            db.prepare("UPDATE users SET role='coordenacao', verificado=1, senha_hash=?, senha_salt=? WHERE id=?").run(h, salt, existente.id);
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(existente.id);
            db.prepare('DELETE FROM resets WHERE user_id=?').run(existente.id);
          });
        }
      }
    }
  }
  /* só e-mails comprovados são promovidos a coordenação (evita que alguém crie conta com o e-mail de outra pessoa) */
  if (ADMINS.length) {
    const promover = db.prepare(`SELECT id FROM users WHERE verificado=1 AND role<>'coordenacao' AND email IN (${ADMINS.map(() => '?').join(',')})`).all(...ADMINS);
    for (const u of promover) transaction(() => {
      db.prepare("UPDATE users SET role='coordenacao' WHERE id=?").run(u.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
      db.prepare('DELETE FROM resets WHERE user_id=?').run(u.id);
    });
  }
} catch (e) { console.error('Erro ao configurar coordenação:', e.message); }

const COOKIE = PROD ? '__Host-cef' : 'cef';
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* cookie malformado */ } }
  });
  return out;
}
const sha256 = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function setSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions(token,user_id,expira_em) VALUES (?,?,?)').run(sha256(token), userId, exp);
  /* no máximo 8 sessões por usuário: as mais antigas saem */
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token NOT IN (SELECT token FROM sessions WHERE user_id=? ORDER BY expira_em DESC LIMIT 8)').run(userId, userId);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${PROD ? '; Secure' : ''}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${PROD ? '; Secure' : ''}`);
}
function publicUser(u) {
  return { nome: u.nome, email: u.email, admin: u.role === 'coordenacao' };
}

/* limitadores de tentativas (em memória) */
const tentativas = new Map();
function limitado(chave, max = 10, janela = 15 * 60e3) {
  const agora = Date.now();
  const lst = (tentativas.get(chave) || []).filter(t => agora - t < janela);
  tentativas.set(chave, lst);
  return lst.length >= max;
}
function falhou(chave) { const l = tentativas.get(chave) || []; l.push(Date.now()); tentativas.set(chave, l); }
/* conta a tentativa e diz se passou do limite */
function excedeu(chave, max, janela) { if (limitado(chave, max, janela)) return true; falhou(chave); return false; }
function ipDe(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  if (PROXY_HOPS && xff.length) return xff[Math.max(0, xff.length - PROXY_HOPS)];
  return req.socket.remoteAddress || '?';
}
const MUITAS = { erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' };

const EVENTOS_OK = new Set(['tela', 'objetivo_criado', 'tarefa_criada', 'tarefa_concluida', 'competencia_adicionada',
  'modelo_usado', 'oportunidade_aberta', 'oportunidade_tarefa', 'avaliacao_nota', 'vaga_aberta', 'curriculo_gerado',
  'teste_concluido', 'conquista']);
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
    let size = 0, estourou = false; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 600e3) { if (!estourou) { estourou = true; chunks.length = 0; reject(Object.assign(new Error('grande'), { status: 413 })); } } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token || token.length > 128) return null;
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expira_em > ?')
    .get(sha256(token), new Date().toISOString()) || null;
}
function transaction(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const hojeLocal = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
const fmtData = s => s ? s.split('-').reverse().join('/') : '';

/* envio de e-mail via API do Resend (https://resend.com). Sem chaves, nada é enviado. */
async function enviarEmail(para, assunto, texto) {
  if (!EMAIL_ATIVO) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: [para], subject: assunto, text: texto })
    });
    if (!r.ok) {
      console.error(`[email] Resend rejeitou o envio (HTTP ${r.status}). Verifique a chave, o remetente/domínio e as restrições da conta no painel do Resend.`);
      return false;
    }
    return true;
  } catch (e) { console.error('Falha ao enviar e-mail:', e.message); return false; }
}
function baseUrl(req) {
  if (BASE_URL) return BASE_URL;
  if (PROD) return '';
  return `http://${req.headers.host || 'localhost:' + PORT}`;
}

/* ---------- rotas ---------- */
function registrar(req, res, b) {
  if (excedeu('reg|' + ipDe(req), 10, 60 * 60e3)) return send(res, 429, MUITAS);
  const nome = str(b.nome, 100).replace(/\s+/g, ' '), email = str(b.email, 160).toLowerCase();
  const curso = str(b.curso, 120), semestre = str(b.semestre, 40), senha = String(b.senha || '');
  if (!/^\S{2,}( \S+)+$/.test(nome)) return send(res, 400, { erro: 'Informe seu nome completo (nome e sobrenome).' });
  if (!emailOk(email)) return send(res, 400, { erro: 'Informe um e-mail válido.' });
  if (senha.length < 8) return send(res, 400, { erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  if (senha.length > SENHA_MAX) return send(res, 400, { erro: 'A senha é longa demais.' });
  if (senhaFraca(senha, email)) return send(res, 400, { erro: 'Essa senha é muito fácil de adivinhar. Escolha outra.' });
  if (b.senha2 != null && String(b.senha2) !== senha) return send(res, 400, { erro: 'As senhas não são iguais.' });
  if (ADMINS.includes(email)) return send(res, 403, { erro: 'Este e-mail é da coordenação. Use "Continuar com Google" para entrar.' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return send(res, 409, { erro: 'Este e-mail já tem cadastro. Use "Entrar".' });
  const salt = crypto.randomBytes(16).toString('hex');
  const info = db.prepare("INSERT INTO users(nome,email,senha_hash,senha_salt,curso,semestre,role,verificado) VALUES (?,?,?,?,?,?,'aluno',0)")
    .run(nome, email, hash(senha, salt), salt, curso, semestre);
  setSession(res, Number(info.lastInsertRowid));
  evento(Number(info.lastInsertRowid), 'cadastro', 'senha');
  send(res, 200, { usuario: { nome, email, admin: false } });
}

const HASH_FALSO = crypto.randomBytes(32).toString('hex'), SALT_FALSO = crypto.randomBytes(16).toString('hex');
function entrar(req, res, b) {
  const email = str(b.email, 160).toLowerCase(), senha = String(b.senha || '').slice(0, SENHA_MAX + 1), ip = ipDe(req);
  if (limitado(ip + '|' + email, 8) || limitado('em|' + email, 20) || limitado('ip|' + ip, 60)) return send(res, 429, MUITAS);
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  /* calcula o hash mesmo quando o e-mail não existe, para não revelar (pelo tempo) quais e-mails têm conta */
  const calc = Buffer.from(hash(senha, u ? u.senha_salt : SALT_FALSO), 'hex');
  const ok = u && senha.length <= SENHA_MAX && crypto.timingSafeEqual(calc, Buffer.from(u.senha_hash, 'hex'));
  if (!ok) { falhou(ip + '|' + email); falhou('em|' + email); falhou('ip|' + ip); return send(res, 401, { erro: 'E-mail ou senha incorretos.' }); }
  setSession(res, u.id);
  evento(u.id, 'login', 'senha');
  send(res, 200, { usuario: publicUser(u) });
}

/* entra (ou cria a conta, no primeiro acesso) por um provedor externo já validado */
function contaExterna(res, email, nome, origem) {
  if (ALLOWED_DOMAIN && !email.endsWith('@' + ALLOWED_DOMAIN))
    return send(res, 403, { erro: 'Use sua conta @' + ALLOWED_DOMAIN + ' para entrar.' });
  let u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  let novo = false;
  const adm = ADMINS.includes(email);
  if (!u) {
    const salt = crypto.randomBytes(16).toString('hex');
    const ins = db.prepare('INSERT INTO users(nome,email,senha_hash,senha_salt,role,verificado) VALUES (?,?,?,?,?,1)')
      .run(str(nome, 100) || email.split('@')[0], email, hash(crypto.randomBytes(24).toString('hex'), salt), salt, adm ? 'coordenacao' : 'aluno');
    u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(ins.lastInsertRowid));
    novo = true;
  } else if (!u.verificado) {
    /* conta criada com senha antes de o e-mail ser comprovado: quem prova ser o dono do e-mail assume a conta,
       e a senha antiga é descartada (impede que um terceiro que se cadastrou antes continue com acesso) */
    const salt = crypto.randomBytes(16).toString('hex');
    transaction(() => {
      db.prepare("UPDATE users SET verificado=1, senha_hash=?, senha_salt=? WHERE id=?").run(hash(crypto.randomBytes(24).toString('hex'), salt), salt, u.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
      db.prepare('DELETE FROM resets WHERE user_id=?').run(u.id);
    });
    u.verificado = 1;
  }
  if (adm && u.role !== 'coordenacao') {
    transaction(() => {
      db.prepare("UPDATE users SET role='coordenacao' WHERE id=?").run(u.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
      db.prepare('DELETE FROM resets WHERE user_id=?').run(u.id);
    });
    u.role = 'coordenacao';
  }
  setSession(res, u.id);
  if (novo) evento(u.id, 'cadastro', origem);
  evento(u.id, 'login_' + origem, origem);
  send(res, 200, { usuario: publicUser(u) });
}

/* login com Google: valida o token de identidade no Google */
async function entrarGoogle(req, res, b) {
  if (!GOOGLE_CLIENT_ID) return send(res, 503, { erro: 'Login com Google não está configurado.' });
  if (excedeu('goo|' + ipDe(req), 40, 15 * 60e3)) return send(res, 429, MUITAS);
  const credential = String(b.credential || '').slice(0, 4000);
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
  contaExterna(res, email, info.name, 'google');
}

/* login com Microsoft 365: confere a assinatura do id_token com as chaves públicas da Microsoft */
let jwksCache = { at: 0, keys: [] };
async function msKeys() {
  if (jwksCache.keys.length && Date.now() - jwksCache.at < 3600e3) return jwksCache.keys;
  const r = await fetch(`https://login.microsoftonline.com/${MS_TENANT}/discovery/v2.0/keys`);
  if (!r.ok) throw new Error('jwks');
  jwksCache = { at: Date.now(), keys: (await r.json()).keys || [] };
  return jwksCache.keys;
}
const b64json = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
async function verificarMicrosoft(idToken, nonce) {
  const p = String(idToken).split('.');
  if (p.length !== 3) throw new Error('formato');
  const h = b64json(p[0]), c = b64json(p[1]);
  if (h.alg !== 'RS256') throw new Error('alg');
  const jwk = (await msKeys()).find(k => k.kid === h.kid);
  if (!jwk) throw new Error('kid');
  const okSig = crypto.verify('RSA-SHA256', Buffer.from(p[0] + '.' + p[1]), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(p[2], 'base64url'));
  const agora = Date.now() / 1000;
  if (!okSig || c.aud !== MS_CLIENT_ID || c.exp < agora || (c.nbf && c.nbf > agora + 60)) throw new Error('claims');
  if (String(c.tid || '').toLowerCase() !== MS_TENANT || c.iss !== `https://login.microsoftonline.com/${MS_TENANT}/v2.0`) throw new Error('tenant');
  if (!nonce || c.nonce !== nonce) throw new Error('nonce');
  return c;
}
async function entrarMicrosoft(req, res, b) {
  if (!MS_ATIVO) return send(res, 503, { erro: 'Login com Microsoft não está configurado.' });
  if (excedeu('ms|' + ipDe(req), 40, 15 * 60e3)) return send(res, 429, MUITAS);
  let c;
  try { c = await verificarMicrosoft(b.id_token, String(b.nonce || '')); }
  catch (e) { return send(res, 401, { erro: 'Não foi possível validar sua conta Microsoft. Tente de novo.' }); }
  const email = str(c.email || c.preferred_username, 160).toLowerCase();
  if (!emailOk(email)) return send(res, 401, { erro: 'Sua conta Microsoft não trouxe um e-mail.' });
  contaExterna(res, email, c.name, 'microsoft');
}

/* recuperação de senha */
function criarReset(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM resets WHERE user_id=?').run(userId);
  db.prepare('INSERT INTO resets(token_hash,user_id,expira_em) VALUES (?,?,?)').run(sha256(token), userId, new Date(Date.now() + 3600e3).toISOString());
  return token;
}
async function esqueci(req, res, b) {
  const email = str(b.email, 160).toLowerCase();
  if (excedeu('esq|' + ipDe(req), 10, 15 * 60e3) || excedeu('esqm|' + email, 4, 60 * 60e3)) return send(res, 429, MUITAS);
  const u = emailOk(email) ? db.prepare('SELECT * FROM users WHERE email=?').get(email) : null;
  if (u && EMAIL_ATIVO) {
    const base = baseUrl(req);
    if (!base) console.error('Defina BASE_URL para enviar os links de redefinição de senha em produção.');
    else {
      const link = `${base}/#redefinir/${criarReset(u.id)}`;
      await enviarEmail(u.email, 'Redefinir sua senha no Carreira em Foco',
        `Olá, ${u.nome}!\n\nPara criar uma nova senha, abra o link abaixo (vale por 1 hora):\n${link}\n\nSe você não pediu isso, ignore esta mensagem.`);
    }
  }
  send(res, 200, { ok: true, emailAtivo: EMAIL_ATIVO });
}
function redefinir(req, res, b) {
  const senha = String(b.senha || '');
  if (excedeu('red|' + ipDe(req), 20, 15 * 60e3)) return send(res, 429, MUITAS);
  if (senha.length < 8) return send(res, 400, { erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  if (senha.length > SENHA_MAX) return send(res, 400, { erro: 'A senha é longa demais.' });
  if (senhaFraca(senha, '')) return send(res, 400, { erro: 'Essa senha é muito fácil de adivinhar. Escolha outra.' });
  const r = db.prepare('SELECT * FROM resets WHERE token_hash=?').get(sha256(String(b.token || '').slice(0, 200)));
  if (!r || r.expira_em < new Date().toISOString()) return send(res, 400, { erro: 'Link inválido ou vencido. Peça um novo.' });
  const salt = crypto.randomBytes(16).toString('hex');
  transaction(() => {
    db.prepare("UPDATE users SET senha_hash=?, senha_salt=?, atualizado_em=datetime('now') WHERE id=?").run(hash(senha, salt), salt, r.user_id);
    db.prepare('DELETE FROM resets WHERE user_id=?').run(r.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(r.user_id);
  });
  evento(r.user_id, 'senha_redefinida', '');
  send(res, 200, { ok: true });
}

function estado(req, res, u) {
  const id = u.id;
  const fb = db.prepare('SELECT * FROM feedback WHERE user_id=?').get(id);
  const un = x => String(x).replace(/:\d+$/, '');
  send(res, 200, {
    profile: { nome: u.nome, curso: u.curso, semestre: u.semestre, area: u.area, lembretes: !!u.lembretes },
    extra: (() => { try { return JSON.parse(u.extra || '{}'); } catch (e) { return {}; } })(),
    skills: db.prepare('SELECT id, tipo AS kind, nome, nivel FROM skills WHERE user_id=? ORDER BY rowid').all(id).map(r => ({ ...r, id: un(r.id) })),
    goals: db.prepare('SELECT id, titulo, prazo, data FROM goals WHERE user_id=? ORDER BY rowid').all(id).map(r => ({ ...r, id: un(r.id) })),
    tasks: db.prepare('SELECT id, goal_id AS goalId, titulo, data, status FROM tasks WHERE user_id=? ORDER BY rowid').all(id).map(r => ({ ...r, id: un(r.id), goalId: un(r.goalId) })),
    feedback: fb ? { util: fb.util, facil: fb.facil, voltar: fb.voltar, texto: fb.comentario } : { texto: '' }
  });
}

function salvar(id, s) {
  transaction(() => {
    const p = s.profile || {};
    const extra = JSON.stringify(s.extra && typeof s.extra === 'object' && !Array.isArray(s.extra) ? s.extra : {});
    db.prepare(`UPDATE users SET nome=?, curso=?, semestre=?, area=?, lembretes=?, atualizado_em=datetime('now') WHERE id=?`)
      .run(str(p.nome, 100) || 'Estudante', str(p.curso, 120), str(p.semestre, 40), str(p.area, 120), p.lembretes ? 1 : 0, id);
    if (extra.length <= 40000) db.prepare('UPDATE users SET extra=? WHERE id=?').run(extra, id);
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
    FROM eventos WHERE tipo IN ('login','login_google','login_microsoft') AND criado_em >= datetime('now','-14 days')
    GROUP BY dia ORDER BY dia`).all();
  const por_tela = db.prepare(`SELECT detalhe, COUNT(*) AS n FROM eventos WHERE tipo='tela' GROUP BY detalhe ORDER BY n DESC LIMIT 10`).all();
  const por_acao = db.prepare(`SELECT tipo, CASE WHEN tipo IN ('oportunidade_aberta','oportunidade_tarefa') THEN detalhe ELSE '' END AS detalhe, COUNT(*) AS n
    FROM eventos WHERE tipo<>'tela' GROUP BY 1, 2 ORDER BY n DESC LIMIT 12`).all();
  const totais = Object.fromEntries(db.prepare('SELECT tipo, COUNT(*) AS n FROM eventos GROUP BY tipo').all().map(r => [r.tipo, r.n]));
  const periodo = { ...db.prepare('SELECT MIN(date(criado_em)) AS inicio, MAX(date(criado_em)) AS fim FROM eventos').get() };
  const mentorias = db.prepare('SELECT status, COUNT(*) AS n FROM mentorias GROUP BY status').all().map(r => ({ ...r }));
  const vagas = db.prepare('SELECT COUNT(*) AS n FROM vagas WHERE ativo=1').get().n;
  return { por_dia, por_tela, por_acao, totais, periodo, mentorias, vagas };
}

function exportarCsv(res) {
  const rows = db.prepare(SQL_RESUMO).all();
  const cols = ['curso', 'semestre', 'objetivos', 'tarefas', 'concluidas', 'atrasadas', 'util', 'facil', 'voltar', 'comentario', 'atualizado'];
  /* evita "injeção de fórmula" em planilhas: textos que começam com = + - @ ganham um apóstrofo */
  const cell = v => { let t = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  const csv = '﻿' + cols.join(';') + '\n' + rows.map(r => cols.map(c => cell(r[c])).join(';')).join('\n');
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="carreira-em-foco-resumo.csv"' });
  res.end(csv);
}

/* mentoria */
const TEMAS = ['Escolha da área', 'Currículo e entrevista', 'Estágio e primeiro emprego', 'Pós-graduação', 'Outro'];
const SQL_MENT_ADMIN = `SELECT m.id, m.tema, m.mensagem, m.status, m.resposta, m.criado_em, m.atualizado_em,
  u.nome, u.email, u.curso, u.semestre FROM mentorias m JOIN users u ON u.id=m.user_id ORDER BY
  CASE m.status WHEN 'pendente' THEN 0 WHEN 'andamento' THEN 1 ELSE 2 END, m.criado_em DESC`;
function criarMentoria(res, u, b) {
  if (excedeu('men|' + u.id, 10, 60 * 60e3)) return send(res, 429, MUITAS);
  const tema = TEMAS.includes(b.tema) ? b.tema : 'Outro', mensagem = str(b.mensagem, 1000);
  if (mensagem.length < 10) return send(res, 400, { erro: 'Conte um pouco mais sobre o que você precisa (mínimo de 10 caracteres).' });
  if (db.prepare("SELECT COUNT(*) AS n FROM mentorias WHERE user_id=? AND status<>'concluida'").get(u.id).n >= 3)
    return send(res, 400, { erro: 'Você já tem 3 pedidos em aberto. Aguarde a resposta da coordenação.' });
  db.prepare('INSERT INTO mentorias(user_id,tema,mensagem) VALUES (?,?,?)').run(u.id, tema, mensagem);
  evento(u.id, 'mentoria_pedida', tema);
  send(res, 200, { ok: true });
}
function responderMentoria(res, id, b) {
  const m = db.prepare('SELECT m.*, u.email, u.nome FROM mentorias m JOIN users u ON u.id=m.user_id WHERE m.id=?').get(id);
  if (!m) return send(res, 404, { erro: 'Pedido não encontrado.' });
  const status = ['pendente', 'andamento', 'concluida'].includes(b.status) ? b.status : m.status;
  const resposta = str(b.resposta, 2000);
  db.prepare("UPDATE mentorias SET status=?, resposta=?, atualizado_em=datetime('now') WHERE id=?").run(status, resposta, id);
  if (resposta && resposta !== m.resposta)
    enviarEmail(m.email, 'A coordenação respondeu ao seu pedido de mentoria', `Olá, ${m.nome}!\n\nA coordenação respondeu ao seu pedido de mentoria:\n\n${resposta}\n\nVeja também no Carreira em Foco, na aba Mentoria.`);
  send(res, 200, { ok: true });
}

/* vagas, cursos e eventos da coordenação */
function criarVaga(res, b) {
  const tipo = ['Estágio', 'Vaga', 'Curso', 'Evento'].includes(b.tipo) ? b.tipo : '';
  const titulo = str(b.titulo, 120), link = str(b.link, 300), prazo = str(b.prazo, 10);
  if (!tipo) return send(res, 400, { erro: 'Escolha o tipo.' });
  if (titulo.length < 3) return send(res, 400, { erro: 'Informe o título.' });
  if (link && !/^https?:\/\/\S+$/i.test(link)) return send(res, 400, { erro: 'O link precisa começar com http:// ou https://.' });
  if (!dateOk(prazo)) return send(res, 400, { erro: 'Data inválida.' });
  db.prepare('INSERT INTO vagas(tipo,titulo,empresa,descricao,link,prazo) VALUES (?,?,?,?,?,?)').run(tipo, titulo, str(b.empresa, 120), str(b.descricao, 600), link, prazo);
  send(res, 200, { ok: true });
}

/* lembretes diários de prazo por e-mail (só para quem ativou no perfil) */
let enviandoLembretes = false;
async function enviarLembretes() {
  if (!EMAIL_ATIVO || enviandoLembretes) return 0;
  const hora = parseInt(new Date().toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }), 10);
  if (hora < LEMBRETE_HORA) return 0;
  enviandoLembretes = true;
  try {
    const hoje = hojeLocal(), limite = hojeLocal(new Date(Date.now() + 2 * 864e5));
    let enviados = 0;
    const alvos = db.prepare("SELECT id, nome, email FROM users WHERE lembretes=1 AND (lembrete_em IS NULL OR lembrete_em <> ?)").all(hoje);
    for (const u of alvos) {
      const ts = db.prepare("SELECT titulo, data FROM tasks WHERE user_id=? AND status<>'done' AND data<>'' AND data<=? ORDER BY data LIMIT 10").all(u.id, limite);
      if (ts.length) {
        const linhas = ts.map(t => `- ${t.titulo} (${t.data < hoje ? 'atrasada desde ' : t.data === hoje ? 'vence hoje, ' : 'até '}${fmtData(t.data)})`).join('\n');
        const site = BASE_URL ? `\n\nAbra o Carreira em Foco: ${BASE_URL}` : '';
        const ok = await enviarEmail(u.email, 'Seus prazos no Carreira em Foco', `Olá, ${u.nome}!\n\nEstas tarefas do seu plano de ação pedem atenção:\n\n${linhas}${site}\n\nPara parar de receber estes lembretes, desative a opção no seu Perfil.`);
        if (!ok) continue;
        enviados++;
      }
      db.prepare('UPDATE users SET lembrete_em=? WHERE id=?').run(hoje, u.id);
    }
    return enviados;
  } finally { enviandoLembretes = false; }
}

const PUBLIC = path.join(__dirname, 'public');
/* Política de segurança de conteúdo: só scripts do próprio site (o script da página entra pelo hash) e do login do Google */
/* A página é montada em memória a partir de src/app.html (se existir); assim um public/index.html velho ou misturado não quebra o site */
const pagina = require('./pagina');
let pgCache = { mtime: -1, html: '' };
function habilitarApi(html) {
  const tag = '<html lang="pt-BR">';
  if (!html.includes(tag)) throw new Error('Documento da página sem a tag HTML esperada.');
  return html.replace(tag, '<html lang="pt-BR" data-api="enabled">');
}
function paginaHtml() {
  let m = 0, tem = true;
  try { m = fs.statSync(pagina.SRC).mtimeMs; } catch (e) { tem = false; }
  if (!tem) { try { return habilitarApi(fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')); } catch (e) { console.error('ERRO ao preparar a página:', e.message); return '<!doctype html><title>Carreira em Foco</title>'; } }
  if (m !== pgCache.mtime) {
    try { pgCache = { mtime: m, html: habilitarApi(pagina.montar()) }; }
    catch (e) { console.error('ERRO ao montar a página:', e.message); try { pgCache = { mtime: m, html: fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8') }; } catch (e2) { pgCache = { mtime: m, html: '' }; } }
  }
  return pgCache.html;
}
let cspCache = { html: null, valor: '' };
function csp() {
  const html = paginaHtml();
  if (html !== cspCache.html) {
    let hashes = '';
    try {
      hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => `'sha256-${crypto.createHash('sha256').update(x[1], 'utf8').digest('base64')}'`).join(' ');
    } catch (e) { /* sem index */ }
    cspCache = { html, valor: [
      "default-src 'self'", `script-src 'self' ${hashes} https://accounts.google.com/gsi/client`,
      "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com", "img-src 'self' data: https:", "connect-src 'self' https://accounts.google.com/gsi/",
      "frame-src https://accounts.google.com/gsi/", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"
    ].join('; ') };
  }
  return cspCache.valor;
}
function cabecalhos(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Content-Security-Policy', csp());
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function estatico(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  if (pathname === '/favicon.ico') pathname = '/favicon.svg';
  let rel; try { rel = decodeURIComponent(pathname); } catch (e) { rel = '/'; }
  const INDEX = path.join(PUBLIC, 'index.html');
  let file = rel.includes('\0') ? INDEX : path.normalize(path.join(PUBLIC, rel === '/' ? 'index.html' : rel));
  let code = 200;
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { file = INDEX; code = 404; }
  if (file === INDEX) {
    const corpo = Buffer.from(paginaHtml(), 'utf8');
    res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Length': corpo.length });
    return res.end(req.method === 'HEAD' ? undefined : corpo);
  }
  res.writeHead(code, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}
/* proteção contra requisições vindas de outros sites (CSRF) nas rotas que alteram dados */
function origemOk(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const o = req.headers.origin;
  if (o) { try { if (new URL(o).host !== req.headers.host) return false; } catch (e) { return false; } }
  if ((req.method === 'POST' || req.method === 'PUT') && Number(req.headers['content-length'] || 0) > 0 && !/^application\/json/i.test(req.headers['content-type'] || '')) return false;
  return true;
}

const server = http.createServer(async (req, res) => {
  cabecalhos(res);
  let pathname;
  try { pathname = new URL(req.url, 'http://x').pathname; } catch (e) { res.writeHead(400); return res.end(); }
  try {
    if (!pathname.startsWith('/api/')) return estatico(req, res, pathname);
    if (!origemOk(req)) return send(res, 403, { erro: 'Requisição bloqueada por segurança.' });
    const m = req.method;
    if (m === 'GET' && pathname === '/api/config') return send(res, 200, {
      googleClientId: GOOGLE_CLIENT_ID, microsoftClientId: MS_ATIVO ? MS_CLIENT_ID : '', microsoftTenant: MS_ATIVO ? MS_TENANT : '', emailAtivo: EMAIL_ATIVO });
    if (m === 'POST' && pathname === '/api/microsoft') return await entrarMicrosoft(req, res, await readBody(req));
    if (m === 'POST' && pathname === '/api/esqueci') return await esqueci(req, res, await readBody(req));
    if (m === 'POST' && pathname === '/api/redefinir') return redefinir(req, res, await readBody(req));
    if (m === 'POST' && pathname === '/api/google') return await entrarGoogle(req, res, await readBody(req));
    if (m === 'POST' && pathname === '/api/registrar') return registrar(req, res, await readBody(req));
    if (m === 'POST' && pathname === '/api/entrar') return entrar(req, res, await readBody(req));
    if (m === 'POST' && pathname === '/api/sair') {
      const token = parseCookies(req)[COOKIE];
      if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(sha256(token));
      clearSession(res);
      return send(res, 200, { ok: true });
    }
    const u = currentUser(req);
    if (!u) return send(res, 401, { erro: 'Entre para continuar.' });
    if (m === 'GET' && pathname === '/api/eu') return send(res, 200, { usuario: publicUser(u) });
    if (m === 'GET' && pathname === '/api/estado') return estado(req, res, u);
    if (m === 'POST' && pathname === '/api/evento') {
      const b = await readBody(req);
      if (EVENTOS_OK.has(b.tipo) && !excedeu('evt|' + u.id, 400, 10 * 60e3)) evento(u.id, b.tipo, b.detalhe);
      return send(res, 200, { ok: true });
    }
    if (m === 'PUT' && pathname === '/api/estado') { salvar(u.id, await readBody(req)); return send(res, 200, { ok: true }); }
    if (m === 'GET' && pathname === '/api/vagas')
      return send(res, 200, { vagas: db.prepare("SELECT id,tipo,titulo,empresa,descricao,link,prazo FROM vagas WHERE ativo=1 AND (prazo='' OR prazo>=?) ORDER BY id DESC").all(hojeLocal()).map(r => ({ ...r })) });
    if (m === 'GET' && pathname === '/api/mentorias')
      return send(res, 200, { mentorias: db.prepare('SELECT id,tema,mensagem,status,resposta,criado_em,atualizado_em FROM mentorias WHERE user_id=? ORDER BY id DESC').all(u.id).map(r => ({ ...r })) });
    if (m === 'POST' && pathname === '/api/mentorias') return criarMentoria(res, u, await readBody(req));
    if (pathname.startsWith('/api/admin/')) {
      if (u.role !== 'coordenacao') return send(res, 403, { erro: 'Acesso restrito à coordenação.' });
      if (m === 'GET' && pathname === '/api/admin/resumo') return send(res, 200, { linhas: db.prepare(SQL_RESUMO).all() });
      if (m === 'GET' && pathname === '/api/admin/atividade') return send(res, 200, atividade());
      if (m === 'GET' && pathname === '/api/admin/exportar.csv') return exportarCsv(res);
      if (m === 'GET' && pathname === '/api/admin/mentorias') return send(res, 200, { mentorias: db.prepare(SQL_MENT_ADMIN).all().map(r => ({ ...r })) });
      const mm = pathname.match(/^\/api\/admin\/mentorias\/(\d+)$/);
      if (m === 'PUT' && mm) return responderMentoria(res, Number(mm[1]), await readBody(req));
      if (m === 'GET' && pathname === '/api/admin/vagas') return send(res, 200, { vagas: db.prepare('SELECT * FROM vagas ORDER BY id DESC').all().map(r => ({ ...r })) });
      if (m === 'POST' && pathname === '/api/admin/vagas') return criarVaga(res, await readBody(req));
      const vv = pathname.match(/^\/api\/admin\/vagas\/(\d+)$/);
      if (m === 'DELETE' && vv) { db.prepare('DELETE FROM vagas WHERE id=?').run(Number(vv[1])); return send(res, 200, { ok: true }); }
      if (m === 'POST' && pathname === '/api/admin/reset') {
        if (excedeu('adr|' + u.id, 30, 60 * 60e3)) return send(res, 429, MUITAS);
        const b = await readBody(req), alvo = db.prepare('SELECT id, role FROM users WHERE email=?').get(str(b.email, 160).toLowerCase());
        if (!alvo) return send(res, 404, { erro: 'Nenhuma conta com este e-mail.' });
        /* a coordenação não gera link para contas de coordenação: evita que uma conta compartilhe ou tome a de outra */
        if (alvo.role === 'coordenacao') return send(res, 403, { erro: 'Contas da coordenação recuperam a senha por "Esqueci minha senha" ou pelo login com Google.' });
        const base = baseUrl(req);
        if (!base) return send(res, 500, { erro: 'Defina a variável BASE_URL no servidor para gerar links.' });
        evento(u.id, 'admin_reset', 'link gerado');
        return send(res, 200, { link: `${base}/#redefinir/${criarReset(alvo.id)}` });
      }
    }
    send(res, 404, { erro: 'Rota não encontrada.' });
  } catch (e) {
    console.error(e);
    if (e && e.status === 413) { res.setHeader('Connection', 'close'); return send(res, 413, { erro: 'Conteúdo grande demais.' }); }
    send(res, e instanceof SyntaxError ? 400 : 500, { erro: 'Não foi possível concluir agora.' });
  }
});

setInterval(() => {
  const agora = new Date().toISOString();
  db.prepare('DELETE FROM sessions WHERE expira_em < ?').run(agora);
  db.prepare('DELETE FROM resets WHERE expira_em < ?').run(agora);
}, 6 * 3600e3).unref();
setInterval(() => { const t = Date.now(); for (const [k, l] of tentativas) if (!l.length || t - l[l.length - 1] > 3600e3) tentativas.delete(k); }, 10 * 60e3).unref();
setInterval(() => enviarLembretes().catch(e => console.error(e)), LEMBRETE_INTERVALO).unref();
setTimeout(() => enviarLembretes().catch(e => console.error(e)), 30000).unref();
server.headersTimeout = 15e3; server.requestTimeout = 30e3;
server.listen(PORT, () => console.log(`Carreira em Foco em http://localhost:${PORT}`));
