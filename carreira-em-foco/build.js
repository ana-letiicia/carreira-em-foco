'use strict';
// Gera public/index.html (documento completo) a partir de src/app.html.
const fs = require('fs');
const { montar } = require('./pagina');
fs.writeFileSync(__dirname + '/public/index.html', montar());
console.log('public/index.html gerado');
