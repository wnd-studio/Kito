<div align="center">

<img src="public/kito-mark.png" alt="Símbolo do Kito" width="100" />

# Kito

**Seu dia, num lugar só.**

Um aplicativo para Windows que reúne oportunidades de trabalho, tarefas, rotina, finanças e ferramentas do dia a dia em uma interface organizada.

[**Como usar**](#comece-aqui) · [**Funcionalidades**](#o-que-você-encontra-no-kito) · [**Desenvolvimento**](#para-desenvolvedores) · [**Guia completo**](docs/GUIA.md)

![Versão](https://img.shields.io/badge/vers%C3%A3o-1.0.6-252826?style=flat-square&labelColor=141615&color=D6FF44)
![Plataforma](https://img.shields.io/badge/plataforma-Windows-252826?style=flat-square&labelColor=141615)
![Tecnologias](https://img.shields.io/badge/Electron-Node.js%20%2B%20SQLite-252826?style=flat-square&labelColor=141615)

</div>

---

## O que é o Kito?

O Kito é uma central pessoal de desktop. Você pode acompanhar candidaturas, planejar o dia, registrar despesas e acessar ferramentas do computador sem precisar alternar entre vários aplicativos.

Os dados são armazenados localmente em SQLite. As integrações externas são opcionais e precisam ser configuradas pelo usuário.

## O que você encontra no Kito

| Área | Para que serve |
| --- | --- |
| **Hoje** | Visualizar um resumo do dia e acessar suas próximas ações. |
| **Vagas & propostas** | Cadastrar oportunidades, acompanhar candidaturas e ver as vagas mais recentes pela data de inclusão. |
| **Correio** | Conectar uma conta Gmail e acompanhar mensagens relacionadas às candidaturas. |
| **Tarefas e rotina** | Organizar atividades, compromissos e hábitos. |
| **Finanças** | Registrar movimentações, controlar contas e consultar dados bancários, se conectar o Pluggy. |
| **Espaços** | Agrupar notas, links e checklists por assunto. |
| **Meu PC e atalhos** | Consultar informações do computador e abrir itens frequentes. |

### Uma interface para personalizar

- **Quatro temas** — Kito, Meia-noite, Claro e Grafite.
- **Atalhos rápidos** — pressione `Ctrl + K` para navegar e abrir ações.
- **Visão geral ajustável** — organize cards e oculte módulos que não usa.
- **Controle de candidaturas** — cada candidatura precisa ser aprovada individualmente antes do envio pelo Kito.

## Comece aqui

### Quero usar o aplicativo no Windows

**[Baixar Kito para Windows](https://github.com/wnd-studio/Kito/releases/latest)**

Na página de download, escolha **Kito Setup** para instalar normalmente ou **Kito** sem Setup para executar a versão portátil. O Kito verifica se há uma nova versão disponível e mostra um aviso com botão para baixar a atualização. Você também pode procurar atualizações em **Configurações → Sobre o Kito**.

> **Importante:** Windows pode exibir um aviso de segurança para versões compiladas sem assinatura digital. Confira a origem do arquivo antes de executá-lo.

### Para desenvolvedores

Você vai precisar de **Windows 10 ou 11**, **Node.js 24+** e **npm**.

```powershell
git clone https://github.com/wnd-studio/Kito.git
cd Kito
npm ci
npm run desktop
```

Para executar os testes e gerar os executáveis:

```powershell
npm test
npm run test:ui
npm run build:win
```

O build gera um **instalador** e uma **versão portátil** na pasta `release/`. Para usar a interface apenas no navegador local, execute `npm start` e abra `http://127.0.0.1:4517`.

## Integrações opcionais

**Gmail** — para ler mensagens e enviar candidaturas aprovadas, configure credenciais OAuth próprias do Google. O Kito nunca deve ser utilizado para enviar candidaturas sem a aprovação individual do usuário.

**Pluggy** — para consultar informações bancárias, conecte credenciais próprias. Os lançamentos manuais funcionam sem essa integração.

**Importação de vagas** — aceita oportunidades verificadas por uma fonte ou automação configurada pelo usuário. Uma instalação nova não faz buscas automáticas na internet por conta própria.

As instruções de configuração, os exemplos de importação e as explicações sobre privacidade estão no **[guia completo](docs/GUIA.md)**.

## Privacidade e dados

O Kito mantém o banco SQLite, configurações e documentos gerados no computador do usuário. O repositório exclui arquivos pessoais, tokens, credenciais, backups, bancos de dados e builds locais por meio do `.gitignore`.

Antes de conectar serviços externos, confira as permissões e a configuração de cada integração no [guia completo](docs/GUIA.md#conectar-o-gmail).

## Projeto

- **Tecnologias:** Electron, Node.js, JavaScript, HTML, CSS e SQLite.
- **Identidade visual:** [Sistema visual do Kito](DESIGN.md).
- **Documentação detalhada:** [Guia de uso e desenvolvimento](docs/GUIA.md).
- **Licença:** nenhuma licença de redistribuição foi declarada neste repositório.

<div align="center">

<sub>Kito · Feito para manter o essencial à mão.</sub>

</div>
