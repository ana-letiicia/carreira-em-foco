'use strict';
// Gera public/index.html (documento completo) a partir de src/app.html.
const fs = require('fs');
const frag = fs.readFileSync(__dirname + '/src/app.html', 'utf8');
const head = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
`;
fs.writeFileSync(__dirname + '/public/index.html', head + frag + '\n</body>\n</html>\n');
console.log('public/index.html gerado');
