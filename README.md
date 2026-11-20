# Kito

**Seu dia, num lugar só.** Aplicativo de desktop para Windows que reúne **vagas e candidaturas, tarefas, rotina, finanças, atalhos, informações do PC e espaços personalizados**. Os dados ficam no computador de cada usuário em um banco SQLite.

## Como instalar e executar

### Windows

Os executáveis são gerados na pasta `release/` pelo comando `npm run build:win`. A versão 1.0.4 gera um instalador (`Kito Setup 1.0.4.exe`) e uma versão portátil (`Kito 1.0.4.exe`). Não é necessário instalar Node.js para utilizar os executáveis.

Na primeira execução de uma instalação nova, o aplicativo cria um banco de dados próprio no perfil do usuário do Windows. A opção **Iniciar com o Windows** pode ser ativada em **Configurações** ou pelo menu da bandeja. Ao fechar a janela, o aplicativo continua na bandeja para executar sincronizações habilitadas. Escolha **Encerrar Kito** no ícone da bandeja para sair.

O aplicativo mantém compatibilidade com instalações antigas que já usavam o banco na pasta local `Vagas/data`, quando identificado o marcador de migração correspondente. Atualizações devem preservar os dados de cada usuário.

### Desenvolvimento

Requisitos para compilar e executar o projeto

- Windows 10/11
- Node.js 24 ou superior
- npm

```powershell
npm ci
npm run desktop
```

Para usar pelo navegador local, execute `npm start` e abra `http://127.0.0.1:4517`. O servidor escuta somente no computador onde foi iniciado. A integração com Gmail e o armazenamento protegido de credenciais são fornecidos pela versão Electron.

```powershell
npm test
npm run test:ui
npm run build:win
```

Os testes utilizam bancos temporários e dependem de Microsoft Edge e Playwright no ambiente local para os testes de interface. O teste específico da janela Electron pode ser executado com `node tests/desktop-window-smoke.cjs`.

## Primeiros passos

Ao abrir o aplicativo, use a barra lateral para navegar entre **Hoje, Vagas, Correio, Tarefas, Rotina, Finanças, Espaços, Meu PC, Atalhos e Configurações**. Use `Ctrl+K` para buscar páginas e espaços ou abrir ações rápidas como **Nova tarefa**, **Nova atividade na rotina**, **Novo lançamento** e **Adicionar vaga**. Use as setas, Enter e Esc para navegar e fechar a busca. Em **Hoje**, você pode ocultar os valores financeiros.

Em **Configurações → Preferências de vagas**, defina suas áreas, palavras-chave, regiões aceitas, trabalho remoto, senioridade e pontuação mínima. Uma instalação nova começa com filtros gerais, sem profissão ou cidade predefinidas. Alterar os critérios afeta as próximas importações, preservando as vagas existentes. Também é possível ocultar módulos e reorganizar os cards da visão geral.

Em **Vagas → Adicionar vaga**, informe empresa, cargo e link do anúncio para salvar uma oportunidade manualmente. O link de candidatura, localização, contrato e demais detalhes são opcionais. Novas vagas ficam aguardando revisão. O aplicativo identifica links duplicados e evita reimportar vagas já descartadas.

Revise oportunidades, descarte as que não interessam e exclua definitivamente registros que não deseja manter. Candidaturas em processamento ou já enviadas ficam protegidas contra exclusão por esse fluxo.

## Importação de vagas

A busca externa por anúncios exige uma fonte ou automação configurada pelo próprio usuário. O aplicativo importa vagas verificadas em arquivos JSON ou NDJSON e registra os resultados localmente. A instalação não inclui uma rotina universal de busca automática de empregos.

```powershell
node daily-import.mjs .\imports\vagas-verificadas.json
```

O importador valida campos obrigatórios, data e evidências da verificação, prazo, preferências do usuário e duplicatas por URL. O histórico aparece em **Vagas → Histórico de buscas**.

Modelo de entrada para uma vaga. Substitua todos os textos e links e registre a data real da conferência antes de importar.

```json
{
  "company": "Empresa Exemplo",
  "title": "Analista de Produto",
  "source": "Página de carreiras",
  "source_url": "https://example.com/vaga/123",
  "application_url": "https://example.com/candidatura/123",
  "location": "Remoto",
  "contract_type": "CLT",
  "requirements": "Requisitos realmente conferidos no anúncio",
  "match_reason": "Motivo real de aderência",
  "description": "Descrição resumida da função",
  "channel": "form",
  "cover_letter": "Apresentação personalizada para revisão",
  "verification": {
    "status": "verified",
    "checked_at": "SUBSTITUIR_PELA_DATA_ISO_DA_CONFERENCIA",
    "notes": "Descrever onde e como os links e a disponibilidade foram conferidos."
  }
}
```

Os canais de candidatura aceitos são `form`, `manual` e `email`. O envio de e-mails exige destinatário (`recipient`), assunto (`subject`) e a integração Gmail autorizada.

## Aprovação e envio de candidaturas

Cada candidatura exige aprovação individual dentro do aplicativo. Para o canal `email`, ao clicar em **Aprovar** com o Gmail conectado, o aplicativo pode enviar a mensagem imediatamente. Caso a conexão esteja indisponível, a candidatura aprovada poderá aguardar na fila até a conexão ser restabelecida. Revise destinatário, apresentação e currículo antes de aprovar.

Em candidaturas com `form` ou `manual`, o Kito abre a etapa para ação humana. Uma aprovação nessa modalidade não confirma que o formulário foi enviado. Mensagens cujo envio ficou incerto exigem conferência no Gmail antes de qualquer nova tentativa.

## Conectar o Gmail

A integração é opcional e utiliza a API do Gmail por OAuth. Cada pessoa deve criar suas credenciais no Google Cloud, ativar a **Gmail API**, configurar a tela de consentimento OAuth e criar credenciais OAuth do tipo **Aplicativo para computador**. Projetos em modo de teste devem incluir os respectivos usuários de teste. O consentimento solicita permissões de leitura e envio de mensagens.

Abra **Correio** no aplicativo Windows, informe o Client ID e o Client Secret da sua própria aplicação OAuth e clique em **Conectar Gmail**. O aplicativo armazena credenciais e tokens com a proteção de dados do Windows no perfil local do usuário.

Com o Gmail conectado, o Kito consulta novas mensagens e pode enviar avisos de oportunidades para o **próprio endereço de e-mail autorizado**. Esses avisos são independentes de candidaturas. O aplicativo acompanha conversas vinculadas às candidaturas.

## Finanças e Pluggy

O registro manual de entradas, despesas e contas a pagar funciona localmente. A conexão bancária via Pluggy é opcional e de leitura, exigindo credenciais criadas por cada usuário.

Em **Finanças → Configurar Pluggy**, informe o Client ID e Client Secret da aplicação Pluggy. A seguir, adicione os identificadores `itemId` das conexões autorizadas e use **Sincronizar**. Os saldos e transações importados ficam separados dos lançamentos manuais. As credenciais ficam criptografadas pelo Windows na versão desktop. O modo navegador aceita `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` como variáveis de ambiente.

## Dados pessoais e privacidade

O banco SQLite, os documentos de candidatura gerados e as credenciais pertencem à instalação local de cada usuário. Para realizar backup, encerre o aplicativo pela bandeja e copie seu diretório de dados do usuário. Em desenvolvimento, o banco padrão fica em `data/vagas.sqlite`, e os documentos preparados ficam em `outbox/`.

As pastas de dados e credenciais, executáveis gerados, backups, arquivos importados e segredos estão excluídos do controle de versão pelo `.gitignore`. Verifique o conteúdo do repositório antes de publicá-lo e nunca inclua arquivos `.env`, tokens OAuth, dados bancários ou currículos pessoais.

A conexão com Gmail e Pluggy usa os serviços dessas plataformas quando habilitada. Os comandos de importação e os serviços externos podem depender de acesso à internet.

## Publicação de código e distribuição

O código-fonte pode ser compartilhado pelo GitHub depois da revisão de privacidade. Este repositório não declara uma licença de redistribuição. Para fornecer um executável a outras pessoas, gere uma compilação Windows, teste o instalador e a versão portátil em um perfil limpo e anexe os executáveis à release correspondente.

A identidade visual Kito está documentada em `DESIGN.md`. O arquivo `public/kito.css` é a última camada de estilos carregada pela interface.
