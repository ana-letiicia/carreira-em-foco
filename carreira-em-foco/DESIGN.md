---
name: Carreira em Foco
description: Planejamento de carreira para estudantes da UNIFAMETRO.
colors:
  green-deep: "#00301B"
  green-institutional: "#003D22"
  green-mid: "#1F6B3F"
  green-bright: "#3BAA35"
  orange: "#F29A1F"
  canvas-light: "#F1F6EF"
  surface-light: "#FFFFFF"
  surface-soft-light: "#F3F8F1"
  ink-light: "#10261A"
  muted-light: "#506558"
  line-light: "#D6E2D3"
  accent-soft-light: "#DDEFD9"
  canvas-dark: "#0B1810"
  surface-dark: "#122619"
  surface-soft-dark: "#183222"
  ink-dark: "#E8F3E6"
  muted-dark: "#9BB4A2"
  line-dark: "#26412E"
  accent-dark: "#5CCB56"
  accent-soft-dark: "#1E4228"
  warning: "#9A4A00"
  warning-soft: "#FDECCB"
  danger: "#B42318"
  danger-soft: "#FBE3E0"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Trebuchet MS, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.4rem)"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Bricolage Grotesque, Trebuchet MS, system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 800
    lineHeight: 1.12
  body:
    fontFamily: "Nunito Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Nunito Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 700
rounded:
  control: "12px"
  card: "16px"
  display: "22px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.green-mid}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    padding: "10px 18px"
    height: "44px"
  button-orange:
    backgroundColor: "{colors.orange}"
    textColor: "#2B1700"
    rounded: "{rounded.control}"
    padding: "10px 18px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.accent-soft-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface-light}"
    rounded: "{rounded.card}"
    padding: "22px"
---

# Design System: Carreira em Foco

## Overview

**Creative North Star:** Não nomeada, conforme preferência do usuário. A documentação descreve o sistema implementado, sem criar uma metáfora de marca.

A interface existente combina verdes de diferentes profundidades, laranja como cor de destaque, fundos claros e componentes em cartões. O usuário descreveu a paleta como “institucional e orientadora”; essa expressão caracteriza a paleta escolhida, não uma promessa de resultado do produto.

A vitrine pública organiza o conteúdo em faixas. Sem sessão, a área ilustrativa mostra o símbolo do favicon; com uma conta conectada, mostra o alvo concêntrico e, quando existem dados, cartões com a competência e o objetivo mais recentes da própria conta. As áreas de autenticação e do estudante usam cartões, navegação por abas e conteúdo em colunas que se reorganizam em larguras menores. O tema escuro troca as superfícies, os textos e os estados sem substituir a estrutura dos componentes. A fonte de verdade visual é o CSS em `src/app.html`; `public/index.html` é gerado a partir dele.

**Key Characteristics:**
- Verdes institucionais e laranja em destaques pontuais.
- Camadas de superfície claras ou escuras, com bordas e sombras discretas.
- Títulos em Bricolage Grotesque e texto de interface em Nunito Sans.
- Navegação e conteúdo adaptados para telas menores.
- Símbolo do favicon para visitantes; alvo concêntrico e cartões de competência e objetivo com dados da conta conectada.
- Tema escuro respeitando a preferência do sistema e o atributo `data-theme`.
- Transições desativadas quando o sistema solicita movimento reduzido.

## Colors

A paleta combina verdes escuros e médios com um verde vivo, laranja de destaque e neutros levemente esverdeados. Os valores de fundo, superfície, texto, borda e estados mudam no tema escuro.

### Primary
- **Verde profundo** (`#00301B`): início do gradiente da vitrine e superfícies institucionais.
- **Verde institucional** (`#003D22`): cabeçalhos de faixa e chamadas institucionais.
- **Verde médio** (`#1F6B3F`): cor de ação e links; também aparece no tema escuro como verde vivo `#5CCB56`.
- **Verde vivo** (`#3BAA35`): indicadores, progresso e detalhes de marca.

### Secondary
- **Laranja de destaque** (`#F29A1F`): botões de ênfase e destaques, incluindo números, avaliações e marcos da linha do tempo.

### Neutral
- **Fundo claro** (`#F1F6EF`): fundo geral no tema claro.
- **Superfície clara** (`#FFFFFF`) e **superfície suave clara** (`#F3F8F1`): cartões, controles e áreas alternadas.
- **Texto claro** (`#10261A`) e **texto secundário claro** (`#506558`): conteúdo principal e informação auxiliar.
- **Borda clara** (`#D6E2D3`): separadores e contornos.
- **Fundo escuro** (`#0B1810`), **superfície escura** (`#122619`) e **superfície suave escura** (`#183222`): camadas no tema escuro.
- **Texto escuro** (`#E8F3E6`), **texto secundário escuro** (`#9BB4A2`) e **borda escura** (`#26412E`): conteúdo e separação no tema escuro.

### Status
- **Aviso** (`#9A4A00`; fundo `#FDECCB`): estados de atenção no tema claro; no escuro, texto `#F5B450` e fundo `#3B2D12`.
- **Erro** (`#B42318`; fundo `#FBE3E0`): estados de erro no tema claro; no escuro, texto `#FF8F85` e fundo `#3D1B18`.

**Regra do Laranja de Destaque.** Use o laranja como acento de ação ou ênfase; não o transforme no fundo dominante das áreas de conteúdo.

## Typography

**Display Font:** Bricolage Grotesque (com Trebuchet MS, system-ui e sans-serif como fallback).
**Body Font:** Nunito Sans (com system-ui, -apple-system, Segoe UI e sans-serif como fallback).

**Character:** O código aplica uma família de títulos expressiva e uma família sem serifa para leitura e controles. Google Fonts fornece as famílias principais; os fallbacks mantêm a hierarquia quando a fonte externa não carrega.

### Hierarchy
- **Display** (800, `clamp(2rem, 5vw, 3.4rem)`, line-height `1.12`, letter-spacing `-.01em`): títulos de destaque.
- **Headline** (800, `1.3rem`, line-height `1.12`): títulos de seção.
- **Title** (600, `1.05rem`, line-height `1.12`): títulos de componentes menores.
- **Body** (400, `16px`, line-height `1.55`): texto geral e formulários.
- **Label** (700, `.9rem`): rótulos de campos; rótulos de seção podem usar `.78rem`, caixa alta e espaçamento de letras `.12em`.

## Layout

O conteúdo principal usa um contêiner de até `1120px`, centralizado, com recuos laterais mínimos de `16px` e respeito às áreas seguras do dispositivo. A navegação superior mede pelo menos `68px`. A vitrine usa uma grade assimétrica de texto e alvo ilustrado, com cartões flutuantes de competência e tarefa à direita; estatísticas de pesquisa aparecem em uma faixa com divisores, sem cartões individuais. Cartões de conteúdo usam duas colunas com intervalo de `20px`.

Em larguras de até `1180px`, a navegação superior some, a navegação inferior fixa é exibida e as grades de destaque, autenticação e conteúdo passam a uma coluna. Até `680px`, os links da navegação inferior ficam em uma única linha horizontal, com ícones e nomes completos lado a lado, sem quebra de texto. A barra pode ser rolada horizontalmente, flutua acima da área segura inferior do aparelho e destaca o item atual; o conteúdo reserva espaço para não ficar encoberto. Grades de oportunidades passam a uma coluna para evitar rolagem horizontal em celulares estreitos. Grades de cartões usam `auto-fit`/`auto-fill` e larguras mínimas por padrão. Espaçamentos de seção variam com `clamp()`.

## Elevation & Depth

O sistema usa camadas tonais para separar estrutura e sombras para cartões, abas selecionadas e autenticação. No tema claro, a sombra comum é `0 1px 2px rgba(0,40,20,.06), 0 8px 24px rgba(0,40,20,.06)`; no escuro, `0 1px 2px rgba(0,0,0,.4)`. Os cartões ilustrativos do alvo usam uma sombra mais profunda de `0 16px 36px rgba(0,0,0,.24)`; a faixa de estatísticas se separa por linhas, não por elevação. Cabeçalho e navegação inferior usam fundo translúcido com desfoque de `10px`.

## Shapes

Controles e botões usam cantos de `12px`; cartões, `16px`; cartões ilustrativos, `14px`; chamadas maiores, `22px`. Abas selecionadas usam `9px`; chips, indicadores e navegação em formato de cápsula usam `999px`. Bordas finas em tons neutros delimitam cartões e campos. O foco do teclado usa contorno visível de `3px`, com deslocamento de `2px`.

## Components

### Buttons

Botões são sólidos e de leitura direta, com altura mínima de `44px`, peso `700` e cantos de `12px`.
- **Primary:** fundo verde de ação, texto branco, padding `10px 18px`.
- **Orange:** fundo `#F29A1F`, texto `#2B1700`; usado para ênfase.
- **Secondary:** fundo verde suave e texto principal.
- **Line / Ghost:** botão contornado com a cor do contexto; a variante ghost usa texto secundário e menor altura.
- **Hover / Focus:** hover aumenta o brilho; o foco visível recebe contorno laranja de `3px`.
- **Motion:** transições são desativadas quando `prefers-reduced-motion: reduce` está ativo.
- **Large / Small:** grande usa altura de `52px`, padding `12px 26px` e raio `14px`; pequeno usa altura mínima de `36px`.

### Chips

Chips de estado usam fundo verde suave; aviso e erro usam os fundos semânticos correspondentes. Opções selecionáveis em formato pill têm borda neutra e fundo de superfície; selecionadas usam fundo de ação e texto contrastante.

### Cards / Containers

Cartões usam superfície principal, borda de `1px`, raio de `16px`, padding de `22px` e a sombra padrão do tema. Estatísticas da vitrine usam padding de `20px`. Cartões flutuantes sobre a ilustração usam raio de `14px`, padding de `12px 14px` e sombra mais pronunciada.

### Inputs / Fields

Campos usam fundo de superfície suave, borda de `1.5px`, raio de `12px`, padding de `10px 12px` e altura mínima de `46px`. Ao receber foco, a borda assume a cor de ação e um halo suave marca o campo. Rótulos aparecem acima do controle, em peso `700`.

### Navigation

A navegação superior é fixa no topo durante a rolagem, com fundo translúcido, desfoque e borda inferior. Links têm estado padrão secundário, hover com fundo verde suave e estado atual preenchido. Até `1180px`, é substituída pela barra inferior que mantém os mesmos nomes; até `680px`, a barra flutua acima da área segura do aparelho e apresenta os links em uma linha rolável, com ícones e rótulos completos lado a lado, sem quebra de linha.

### Tabs

Abas ficam sobre uma superfície suave, com contêiner de `12px` e padding de `4px`. A aba atual usa superfície principal, texto principal, raio de `9px` e sombra padrão.

### Feedback and progress

Avisos temporários usam uma cápsula fixa próxima ao rodapé. Barras de progresso usam trilho verde suave e preenchimento verde vivo; indicadores de avaliação usam laranja quando selecionados.

### Task completion

Na lista “Próximas tarefas”, tarefas concluídas permanecem visíveis após a ação. O controle muda para fundo verde com check branco, anuncia “Reabrir” para tecnologias assistivas e a tarefa recebe texto riscado e chip “Concluída”. Acioná-lo novamente reabre a tarefa e remove a marca.

### Career path

O alvo decorativo da vitrine combina círculos concêntricos e marcas cardeais em verde, com centro laranja. Dois cartões escuros sobrepostos mostram cinco pontos de competência e uma barra com “3 de 5 tarefas feitas”, como exemplos visuais, sem representar progresso de uma conta real.

## Do's and Don'ts

### Do:
- **Do** use `src/app.html` como fonte de verdade para estilos; `public/index.html` é saída gerada por `node build.js`.
- **Do** manter as variantes de tema para fundos, superfícies, texto, bordas e estados.
- **Do** reservar laranja para ações e destaques, conforme o uso observado.
- **Do** preservar o layout de navegação inferior e o espaço de conteúdo correspondente em larguras de até `1180px`.
- **Do** manter o indicador de foco visível e os estados atuais de navegação.
- **Do** manter os cartões do alvo identificados como ilustração decorativa, sem associar os valores a uma conta real.

### Don't:
- **Don't** substituir a paleta verde e laranja por cores semânticas de outra marca.
- **Don't** aplicar sombras fortes a todos os cartões; o valor mais forte está reservado aos elementos flutuantes.
- **Don't** usar a ilustração do alvo para afirmar progresso real de um estudante.
- **Don't** editar diretamente `public/index.html` para mudanças persistentes: atualize `src/app.html` e gere a página.
- **Don't** inventar uma metáfora visual ou alegações de impacto como se tivessem sido confirmadas.
