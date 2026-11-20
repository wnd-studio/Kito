# Kito — sistema visual

## Conceito

**Kito** (pronúncia "quí-to") reúne o cotidiano do usuário em uma interface direta, calma e funcional. A personalidade aparece no símbolo geométrico assimétrico, que combina um gato e um terminal com olhos em forma de cursor e sublinhado. O mascote é usado com moderação em momentos leves e no reconhecimento da marca.

## Cores

| Elemento | Hex | Uso |
| --- | --- | --- |
| Fundo | `#141615` | Canvas principal |
| Painel | `#1B1E1B` | Cards e áreas de trabalho |
| Superfície elevada | `#252826` | Diálogos, menus e foco contextual |
| Texto | `#F3F2EB` | Conteúdo principal |
| Texto secundário | `#B1B8AE` | Metadados e descrições |
| Lima | `#D6FF44` | Ação principal, foco, seleção, marca |
| Recebido | `#8BDEAE` | Indicadores de entrada e sucesso |
| A vencer | `#FFD27A` | Avisos e prazos |
| Atrasado | `#FF9194` | Erros e atrasos |

Use cor e rótulo juntos nos estados de vagas, contas e tarefas. Priorize legibilidade em todos os módulos.

## Tipografia e medidas

- Fonte principal **Nimbus Sans**, com fontes de sistema como fallback. Use **Nimbus Mono PS** para atalhos e dados que se beneficiem de alinhamento monoespaçado.
- Título de página com referência de `40/48px`, de seção `24/32px`, corpo `16/24px`, metadados `14/20px` e atalhos `13/18px`.
- Escala de espaçamento `4, 8, 12, 16, 24, 32, 48px`.
- Botões entre `40–44px` de altura e raio `8px`. Painéis com raio `12px` e preenchimento de `24px`. Linhas interativas entre `48–56px`.
- Superfícies com bordas sutis, sem decoração excessiva. O contraste entre hierarquias depende de tipografia, espaçamento e intenção.

## Navegação e comportamento

- **Hoje** é a entrada diária, com próxima ação, tarefas, oportunidades e finanças. O usuário controla a visibilidade de valores sensíveis.
- `Ctrl+K` abre ações rápidas e navegação. O campo recebe foco. Setas percorrem resultados, Enter executa ou abre e Esc fecha com retorno ao elemento anterior.
- Abaixo de `960px`, o conteúdo se empilha. Abaixo de `760px`, a navegação fica compacta. Preserve leitura e operação também em `320px` e com zoom a `200%`.
- Hover entre `100–140ms` e abertura do menu de comando entre `160–200ms` quando há movimento. Respeite `prefers-reduced-motion`.
- Indicadores de foco visíveis e distinguíveis. Use contraste mínimo de `4.5:1` para textos comuns e `3:1` para títulos grandes e ícones essenciais.
- Todas as datas e quantias da interface devem utilizar português brasileiro, com descrição textual para estados e ações importantes.

## Tom de voz

Frases curtas e humanas. Use verbos concretos nas ações e feedbacks, com erros que expliquem o que ocorreu e como tentar novamente. Elimine textos decorativos, jargão e marketing genérico.

## Implementação

`public/kito.css` implementa a identidade visual depois de `style.css`, `liquid.css` e `professional.css`. A marca aparece na navegação (`public/kito-mark.png`) e nos ícones do aplicativo (`desktop/app-icon.*`). Em novas telas, utilize variáveis existentes e os mesmos estados de foco, erro, sucesso e navegação. A identidade acompanha o documento `Kito-Brand-Guide.pptx` fornecido pelo autor.