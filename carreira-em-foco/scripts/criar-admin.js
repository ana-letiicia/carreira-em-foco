'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('node:crypto');

const email = (process.argv[2] || '').trim().toLowerCase();
const senha = process.env.ADMIN_PASSWORD || '';

if (process.argv[3]) {
    console.error('Não informe a senha como argumento. Configure ADMIN_PASSWORD em uma variável de ambiente privada.');
    process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Informe um e-mail válido. Uso: npm run criar-admin -- email@exemplo.com');
    process.exit(1);
}
if (senha.length < 10 || senha.length > 200) {
    console.error('Configure ADMIN_PASSWORD com pelo menos 10 e no máximo 200 caracteres em uma variável de ambiente privada.');
    process.exit(1);
}

const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'carreira.db'));

try {
    const colunas = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    if (!colunas.includes('verificado')) throw new Error('A coluna de verificação de e-mail não existe. Inicie o servidor para aplicar a migração e tente novamente.');

    db.exec('BEGIN IMMEDIATE');
    try {
        const user = db.prepare('SELECT id, verificado FROM users WHERE email=?').get(email);
        if (!user) throw new Error('Nenhuma conta existente com esse e-mail. Para criar a primeira conta administrativa, configure ADMIN_EMAIL e ADMIN_PASSWORD no servidor.');
        if (user.verificado !== 1) throw new Error('A conta precisa ter o e-mail verificado por um provedor confiável antes de ser promovida.');

        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
        db.prepare("UPDATE users SET role='coordenacao', senha_hash=?, senha_salt=? WHERE id=? AND verificado=1").run(hash, salt, user.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
        db.prepare('DELETE FROM resets WHERE user_id=?').run(user.id);
        db.exec('COMMIT');
    } catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }

    console.log('Conta verificada promovida para coordenação. Sessões e links de redefinição anteriores foram invalidados.');
} catch (e) {
    console.error(e.message);
    process.exitCode = 1;
} finally {
    db.close();
}
