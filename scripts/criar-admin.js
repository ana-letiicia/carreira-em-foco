'use strict';
// Uso: npm run criar-admin -- email@faculdade.edu.br
// Promove um usuário já cadastrado ao perfil "coordenacao".
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const email = (process.argv[2] || '').toLowerCase();
if (!email) { console.error('Informe o e-mail: npm run criar-admin -- email@exemplo.com'); process.exit(1); }
const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'carreira.db'));
const r = db.prepare("UPDATE users SET role='coordenacao' WHERE email=?").run(email);
console.log(r.changes ? `${email} agora é coordenação.` : 'Usuário não encontrado. Cadastre-se primeiro pelo site.');
