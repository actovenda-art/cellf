# Cellf — Reparo e Comércio

Sistema de gestão para assistência técnica e comércio de celulares, com identidade oficial Cellf e uma interface responsiva para a operação completa da loja. Os cadastros são persistidos no Supabase Postgres e os documentos empresariais ficam em um bucket privado do Supabase Storage, permitindo acessar as mesmas informações em dispositivos diferentes.

## Módulos disponíveis

- **Visão geral:** indicadores operacionais, ordens recentes, estoque e lembretes.
- **Ordens de serviço:** clientes, aparelhos, IMEI, defeitos, prazos e acompanhamento de status.
- **Clientes:** cadastro, dados de contato e histórico de atendimento.
- **Agenda:** organização dos compromissos e da rotina da assistência.
- **Produtos e estoque:** preços, custos, SKU, estoque mínimo e movimentações.
- **Serviços:** catálogo de reparos com preços definidos ou sob consulta.
- **Vendas / PDV:** atendimento de balcão e registro de vendas de produtos.
- **Contas a pagar:** controle de vencimentos e confirmação de pagamentos.
- **Relatórios:** indicadores de desempenho e acompanhamento da operação.
- **Configurações:** sub-abas Empresa, Administrador, Documentos, Operação, Avisos e Privacidade, reunindo nome, slogan, CNPJ, responsável, endereço, anexos empresariais e preferências da loja em um único formulário.

A plataforma também oferece busca global, notificações, consulta de IMEI por proxy seguro e navegação adaptada para computador, tablet e celular.

## Como rodar

É necessário Node.js 20 ou superior.

```bash
npm start
```

Abra `http://localhost:4173`.

Não há dependências de terceiros, portanto não é necessário executar `npm install`.

## Verificação

```bash
npm run check
npm test
```

Os testes verificam a disponibilidade das telas, dos arquivos estáticos, da identidade visual, da acessibilidade, dos fluxos operacionais, dos dados da empresa e dos contratos principais da API.

Os testes verificam também a autenticação, a persistência remota, as políticas de segurança do banco, a privacidade do bucket e a ausência de chaves administrativas no navegador.

## Configurar o Supabase

1. No SQL Editor do projeto Supabase, execute o arquivo `supabase/schema.sql`. Ele cria a estrutura de dados com Row Level Security (RLS), restringe o acesso à função de serviço e prepara o bucket privado de documentos.
2. Copie `.env.example` para `.env` e configure as variáveis:
   - `SUPABASE_URL`: endereço do projeto, como `https://seu-projeto.supabase.co`.
   - `SUPABASE_SECRET_KEY`: chave secreta do Supabase, usada exclusivamente no servidor. A variável `SUPABASE_SERVICE_ROLE_KEY` também é aceita para projetos que ainda utilizam a chave legada.
   - `CELLF_APP_PASSWORD`: senha exigida para entrar na aplicação.
   - `CELLF_AUTH_SECRET`: segredo longo e aleatório usado para assinar a sessão.
3. Opcionalmente, personalize `SUPABASE_STATE_ID` e `SUPABASE_DOCUMENT_BUCKET` se precisar separar ambientes ou alterar o nome do bucket.
4. Reinicie o servidor e faça login com a senha configurada.

O navegador conversa apenas com as rotas `/api/session`, `/api/state` e `/api/documents`; a chave privilegiada permanece no servidor. A sessão é protegida por um cookie assinado `HttpOnly`, e os documentos são enviados e baixados por URLs assinadas com validade limitada.

### Publicação na Vercel

Cadastre as mesmas variáveis de ambiente nas configurações do projeto na Vercel e publique novamente. Nunca coloque `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CELLF_APP_PASSWORD` ou `CELLF_AUTH_SECRET` em arquivos públicos, no JavaScript do navegador ou no repositório.

## Configurar a consulta de IMEI

1. Crie uma conta na Infosimples e obtenha o token.
2. Copie `.env.example` para `.env`.
3. Preencha `INFOSIMPLES_TOKEN`.
4. Reinicie o servidor.

O navegador chama apenas `POST /api/imei`; o token permanece no servidor. A URL da consulta pode ser ajustada com `INFOSIMPLES_ENDPOINT` caso a sua conta informe um endpoint diferente.

## Segurança dos dados

A tabela de estado utiliza RLS e não concede leitura ou escrita às funções públicas. Os documentos permanecem em um bucket privado, com limite de 10 MB por arquivo e validação de formato. Sem credenciais de Supabase ou sem os segredos da sessão, as rotas protegidas recusam o acesso em vez de recorrer a armazenamento local desprotegido.
