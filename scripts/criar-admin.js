'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const email = (process.argv[2] || '').toLowerCase();

if (!email) {
    console.error('Informe o e-mail: npm run criar-admin -- email@exemplo.com');
    process.exit(1);
}

const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'carreira.db'));

// Verifica se o usuário já existe
let user = db.prepare("SELECT id FROM users WHERE email=?").get(email);

if (!user) {
    // Se não existir, cria o usuário diretamente como coordenação
    const insert = db.prepare(`
        INSERT INTO users (nome, email, senha_hash, senha_salt, curso, semestre, area, role)
        VALUES (?, ?, 'manual', 'manual', 'Administração', '1° semestre', 'Geral', 'coordenacao')
    `);
    insert.run('Coordenador', email);
    console.log(`Utilizador ${email} criado e promovido a coordenação com sucesso!`);
} else {
    // Se já existir, apenas atualiza a role
    db.prepare("UPDATE users SET role='coordenacao' WHERE email=?").run(email);
    console.log(`${email} agora é coordenação.`);
}