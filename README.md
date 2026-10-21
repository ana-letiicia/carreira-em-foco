# Carreira em Foco

Sistema web de planejamento de carreira para estudantes da UNIFAMETRO (projeto de extensão curricular).
Site completo com cadastro e login, banco de dados SQLite e painel da coordenação.
Não usa dependências externas: só o Node.js 22.13 ou mais novo.

## Rodar
```bash
node server.js            # ou: npm start
# abre em http://localhost:3000
```

Variáveis de ambiente (opcionais):

| Variável       | Para que serve                                                            |
|----------------|---------------------------------------------------------------------------|
| `PORT`         | Porta HTTP (padrão 3000)                                                  |
| `DB_PATH`      | Arquivo do banco (padrão `data/carreira.db`)                              |
| `ADMIN_EMAILS` | E-mails (separados por vírgula) que viram coordenação ao se cadastrar     |
| `NODE_ENV`     | Use `production` atrás de HTTPS para cookies seguros                      |

Exemplo de produção:
```bash
NODE_ENV=production PORT=8080 ADMIN_EMAILS=coordenacao@unifametro.edu.br node server.js
```
Também dá para promover alguém depois do cadastro: `npm run criar-admin -- email@unifametro.edu.br`.

## Login com Google (opcional)
1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials) crie um **ID do cliente OAuth** do tipo "Aplicativo da Web".
2. Em "Origens JavaScript autorizadas", coloque o endereço do site (ex.: `https://carreira.unifametro.edu.br`).
3. Rode o servidor com `GOOGLE_CLIENT_ID=<seu id>` (e, se quiser limitar a e-mails da faculdade, `GOOGLE_ALLOWED_DOMAIN=unifametro.edu.br`).
O botão "Continuar com Google" aparece sozinho na tela de entrar. Sem `GOOGLE_CLIENT_ID`, só o login com e-mail e senha fica ativo.
Login com Microsoft 365 (se a faculdade usa) pode ser adicionado da mesma forma, mas precisa do cadastro do app no Azure.

## Onde ver as respostas e as interações dos usuários
- **No próprio site:** entre com uma conta de coordenação e abra a aba **Coordenação**. Lá estão estudantes por curso, notas e sugestões da avaliação, acessos por dia, telas mais visitadas e ações mais feitas. O botão "Baixar planilha (CSV)" abre no Excel.
- **No banco:** o arquivo `data/carreira.db` abre no [DB Browser for SQLite](https://sqlitebrowser.org). Tabelas úteis: `feedback` (respostas), `eventos` (interações), `users`, `goals`, `tasks`.
  Exemplo: `SELECT tipo, COUNT(*) FROM eventos GROUP BY tipo ORDER BY 2 DESC;`
- Quem é coordenação: e-mails em `ADMIN_EMAILS` ou `npm run criar-admin -- email`.

## Estrutura
- `server.js`: servidor HTTP e API (`/api/...`).
- `schema.sql`: tabelas do banco (users, sessions, skills, goals, tasks, feedback). O banco é criado sozinho na primeira execução.
- `src/app.html`: código-fonte do site (HTML, CSS e JS em um arquivo). `node build.js` gera `public/index.html`.
- `data/`: onde fica o arquivo do banco. Faça backup desta pasta.

## Banco de dados
Cada estudante tem um usuário e suas próprias linhas em `skills`, `goals`, `tasks` e `feedback`.
Senhas são guardadas com `scrypt` e sal individual. Sessões usam cookie `HttpOnly`.

A coordenação (`role = 'coordenacao'`) vê só dados agregados: curso, semestre, quantidade de objetivos e tarefas,
atrasos, avaliações e sugestões, sem nome nem e-mail, com exportação em CSV (`/api/admin/exportar.csv`).

## Colocar no ar
**Opção A, servidor da faculdade:** veja os passos abaixo.

**Opção B, hospedagem na nuvem (Render, Railway, Fly.io):** suba esta pasta para um repositório no GitHub e crie um serviço web a partir dele usando o `Dockerfile` incluso. Defina as variáveis `ADMIN_EMAILS` (e `GOOGLE_CLIENT_ID`) e **anexe um disco persistente montado em `/app/data`**; sem ele o banco é apagado a cada reinício.

## Colocar no ar na faculdade
1. Instale o Node.js 22 LTS no servidor.
2. Copie esta pasta, defina `ADMIN_EMAILS` e `NODE_ENV=production` e rode `node server.js` (use `systemd` ou `pm2` para manter ligado).
3. Coloque um proxy com HTTPS (nginx, Caddy ou o do setor de TI) na frente da porta escolhida.
4. Agende backup diário da pasta `data/`.

## Pontos a combinar com o setor de TI
- Login: hoje é e-mail e senha próprios. Para usar o login institucional (SSO), troque as rotas `/api/entrar` e `/api/registrar`.
- LGPD: o sistema guarda nome, e-mail, curso e o plano de carreira do estudante. Defina com a instituição a base legal, o prazo de guarda e como o estudante pede a exclusão da conta.
