'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('node:crypto');

const email = (process.argv[2] || '').toLowerCase();
const senha = process.argv[3] || process.env.ADMIN_PASSWORD;

if (!email) {
    console.error('Uso: npm run criar-admin -- email@exemplo.com [senha]');
    process.exit(1);
}

const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'carreira.db'));

// Gera salt e hash compatíveis
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(senha, salt, 64).toString('hex');

let user = db.prepare("SELECT id FROM users WHERE email=?").get(email);

if (!user) {
    const insert = db.prepare(`
        INSERT INTO users (nome, email, senha_hash, senha_salt, curso, semestre, area, role)
        VALUES (?, ?, ?, ?, 'Administração', '1° semestre', 'Geral', 'coordenacao')
    `);
    insert.run('Coordenador', email, hash, salt);
    console.log(`Utilizador ${email} criado como coordenação! Senha: ${senha}`);
} else {
    db.prepare("UPDATE users SET role='coordenacao', senha_hash=?, senha_salt=? WHERE email=?").run(hash, salt, email);
    console.log(`Utilizador ${email} atualizado para coordenação! Nova senha: ${senha}`);
}