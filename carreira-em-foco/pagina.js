'use strict';
// Monta o documento HTML completo a partir de src/app.html (usado por build.js e pelo servidor).
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'src', 'app.html');
const CABECA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Carreira em Foco</title>
<link rel="icon" type="image/svg+xml" href="favicon.svg?v=2">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
`;
function montar() {
  let corpo = fs.readFileSync(SRC, 'utf8').replace(/^\uFEFF/, '');
  /* dentro do <script>, caracteres fora do ASCII viram escapes \uXXXX: o JS fica imune a problemas de codificação */
  corpo = corpo.replace(/<script>([\s\S]*?)<\/script>/, (m, js) => '<script>' + js.replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '</script>');
  const html = CABECA + corpo + '\n</body>\n</html>\n';
  const n = (html.match(/<script[\s>]/g) || []).length, f = (html.match(/<\/script>/g) || []).length;
  if (n !== 1 || f !== 1) throw new Error(`src/app.html deveria ter exatamente 1 <script> (achou ${n} abertura(s) e ${f} fechamento(s)). O arquivo foi alterado ou misturado.`);
  return html;
}
module.exports = { montar, SRC };
