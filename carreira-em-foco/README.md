# Carreira em Foco

Sistema web de planejamento de carreira para estudantes da UNIFAMETRO (projeto de extensão curricular).
Site completo com cadastro e login, banco de dados SQLite, painel da coordenação, mentoria, vagas e lembretes.
Não usa dependências externas: só o Node.js 22.13 ou mais novo.

## Rodar
```bash
node server.js            # ou: npm start
# abre em http://localhost:3000
```

## Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `PORT` | Porta HTTP (padrão 3000) |
| `DB_PATH` | Arquivo do banco (padrão `data/carreira.db`) |
| `ADMIN_EMAILS` | E-mails (separados por vírgula) promovidos a coordenação apenas depois de comprovados por Google/Microsoft |
| `NODE_ENV` | Use `production` atrás de HTTPS (cookies seguros) |
| `BASE_URL` | Endereço público do site, ex.: `https://carreira.unifametro.edu.br`. **Obrigatório em produção** para os links de e-mail |
| `RESEND_API_KEY`, `EMAIL_FROM` | Envio de e-mails (recuperação de senha, lembretes, resposta da mentoria) via [Resend](https://resend.com). Sem isso o site funciona, só não envia e-mails |
| `GOOGLE_CLIENT_ID` | Ativa "Continuar com Google" |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_TENANT` | Ativa "Continuar com Microsoft 365". `MICROSOFT_TENANT` deve ser o **ID (GUID)** do diretório da faculdade |
| `ALLOWED_DOMAIN` | (opcional) limita os logins Google e Microsoft a um domínio, ex.: `unifametro.edu.br` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Juntos, criam ou configuram a conta de coordenação inicial (senha com 10+ caracteres). Defina ambos só nas variáveis privadas do servidor (Railway), nunca no código nem como argumento de terminal. Se a senha ou os privilégios mudarem, sessões e links de redefinição existentes são invalidados. Não há e-mail administrador padrão. |
| `TRUST_PROXY_HOPS` | Quantos proxies ficam na frente do servidor (padrão 1 em produção, como no Railway). Serve para o limite de tentativas usar o IP real de cada pessoa |
| `LEMBRETE_HORA`, `LEMBRETE_INTERVALO_MS`, `TZ_LEMBRETE` | Horário (padrão 8h), intervalo de verificação e fuso (padrão America/Fortaleza) dos lembretes |

Exemplo de produção:
```bash
NODE_ENV=production PORT=8080 BASE_URL=https://carreira.unifametro.edu.br \
ADMIN_EMAILS=coordenacao@unifametro.edu.br RESEND_API_KEY=... EMAIL_FROM="Carreira em Foco <carreira@unifametro.edu.br>" node server.js
```
Para promover uma conta existente depois do cadastro, ela precisa ter o e-mail verificado por Google/Microsoft. Configure `ADMIN_PASSWORD` como variável de ambiente privada (nunca passe a senha como argumento) e execute `npm run criar-admin -- email@unifametro.edu.br`. O script encerra as sessões existentes e invalida links de redefinição. Para criar a primeira conta administrativa, configure `ADMIN_EMAIL` e `ADMIN_PASSWORD` no servidor.

## O que o sistema tem
- **Estudante:** perfil e competências, objetivos e plano de ação, **linha do tempo por mês ou semestre**, **teste de perfil profissional**, **gerador de currículo** (PDF pela impressão e Word), **conquistas e sequência de acessos**, oportunidades (inclui **vagas e eventos divulgados pela coordenação**), **pedido de mentoria**, **lembretes de prazo por e-mail**, avaliação do sistema.
- **Coordenação:** resumo agregado e uso do site, **publicação de vagas e eventos**, **respostas às mentorias**, **relatório pronto para o portfólio**, link de redefinição de senha para estudante, exportação CSV.
- **Acesso:** e-mail e senha, **Google**, **Microsoft 365**, **esqueci minha senha**.

## Como ativar cada login
- **Google:** Google Cloud Console, crie um "ID do cliente OAuth" tipo Web, adicione o endereço do site em "Origens JavaScript autorizadas" e informe o ID em `GOOGLE_CLIENT_ID`.
- **Microsoft 365:** no Microsoft Entra ID (Azure) registre um aplicativo de página única, com URI de redirecionamento `https://SEU-SITE/` e marque "Tokens de ID" em Autenticação. Informe o ID do aplicativo em `MICROSOFT_CLIENT_ID` e o ID do diretório em `MICROSOFT_TENANT`.
- **E-mails:** crie conta no Resend, verifique o domínio de envio e configure `RESEND_API_KEY`, `EMAIL_FROM` (remetente dentro do domínio verificado) e `BASE_URL` nas variáveis do Railway. `emailAtivo: true` confirma apenas que as variáveis estão configuradas; confira o painel/logs do Resend para saber se a mensagem foi aceita e entregue. `GOOGLE_CLIENT_ID` habilita apenas o login Google; não configura envio de e-mail.

## Estrutura
- `server.js`: servidor HTTP e API (`/api/...`).
- `schema.sql`: tabelas (users, sessions, skills, goals, tasks, feedback, eventos, resets, mentorias, vagas). O banco é criado e atualizado sozinho na primeira execução.
- `src/app.html`: código-fonte do site. `node build.js` gera `public/index.html`.
- `data/`: arquivo do banco. **Faça backup desta pasta.**

## Segurança
- Senhas com `scrypt` e sal; mínimo de 8 caracteres, recusa as mais comuns; sessões em cookie `HttpOnly`, `SameSite=Lax`, `Secure` e prefixo `__Host-` em produção; o token da sessão é guardado no banco só como hash.
- Limite de tentativas por IP e por e-mail (login, cadastro, recuperação de senha, Google); o tempo de resposta do login não revela se o e-mail existe.
- Cabeçalhos: Content-Security-Policy restrita (só o script do próprio site e do Google), HSTS, X-Frame-Options, nosniff, Permissions-Policy.
- Proteção contra requisições de outros sites (CSRF) por checagem de origem e tipo do conteúdo; limite de tamanho das requisições.
- Quem se cadastra com senha **nunca** vira coordenação apenas por informar um e-mail listado; o e-mail deve ser comprovado por Google/Microsoft ou a conta deve ser provisionada por `ADMIN_EMAIL`/`ADMIN_PASSWORD` no servidor.
- Se alguém se cadastrar com o e-mail de outra pessoa e a dona entrar depois com Google, a senha antiga é descartada e a conta passa a ser só da dona.
- A coordenação não gera link de senha para outras contas de coordenação. A exportação CSV neutraliza fórmulas de planilha. Links de vagas só aceitam http(s).
- Não há confirmação de e-mail no cadastro por senha. Para exigir isso, use só Google/Microsoft com `ALLOWED_DOMAIN`.

## Onde ver as respostas e as interações dos usuários
- **No próprio site:** entre com uma conta de coordenação e abra a aba **Coordenação**: estudantes por curso, notas e sugestões da avaliação, acessos por dia, telas mais visitadas, ações mais feitas, vagas, mentorias e o relatório para o portfólio. "Baixar planilha (CSV)" abre no Excel.
- **No banco:** o arquivo `data/carreira.db` abre no [DB Browser for SQLite](https://sqlitebrowser.org). Tabelas úteis: `feedback` (respostas), `eventos` (interações), `users`, `goals`, `tasks`, `mentorias`, `vagas`.

## Railway
- Variáveis (aba Variables): `GOOGLE_CLIENT_ID`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BASE_URL` (o endereço do site) e, se quiser e-mails, `RESEND_API_KEY` e `EMAIL_FROM`. `NODE_ENV` e `PORT` já vêm do `Dockerfile`.
- O arquivo `.env` serve só para testar no seu computador: ele não vai para o GitHub (está no `.gitignore`), então copie as variáveis para o Railway.
- Volume: crie um Volume no serviço montado em `/app/data`. O `Dockerfile` não usa `VOLUME` porque o Railway não aceita essa instrução.
- O banco antigo continua valendo: o servidor novo atualiza as tabelas sozinho na primeira execução e os estudantes já cadastrados mantêm a conta e a senha. Quem estava logado precisará entrar de novo uma vez.

## Banco de dados e privacidade
Senhas usam `scrypt` com sal individual; sessões usam cookie `HttpOnly`; links de redefinição são de uso único e guardados só como hash.
A coordenação vê dados agregados (sem nome nem e-mail), exceto nos pedidos de mentoria, onde nome, curso e e-mail aparecem porque a resposta é individual.

## Colocar no ar
1. Hospede onde rode Node.js 22 ou Docker (Render, Railway, Fly.io ou servidor da faculdade). O `Dockerfile` já está pronto.
2. **Use disco persistente** em `/app/data` (senão o banco se perde a cada atualização).
3. Defina as variáveis acima, principalmente `BASE_URL`, `NODE_ENV=production` e `ADMIN_EMAILS`.
4. Use HTTPS (as plataformas acima já entregam) e agende backup da pasta `data/`.

## Pontos a combinar com o setor de TI
- O cadastro por e-mail e senha **não confirma** que o e-mail pertence ao estudante. Para garantir, use login Microsoft 365 ou Google com `ALLOWED_DOMAIN`.
- LGPD: o sistema guarda nome, e-mail, curso e o plano de carreira. Defina base legal, prazo de guarda e como o estudante pede a exclusão da conta.
