# Cellf — Reparo e Comércio

Sistema de gestão para assistência técnica e comércio de celulares, com identidade oficial Cellf e uma interface responsiva para a operação completa da loja. Os cadastros são persistidos no Supabase Postgres e os documentos empresariais ficam em um bucket privado do Supabase Storage, permitindo acessar as mesmas informações em dispositivos diferentes.

## Módulos disponíveis

- **Visão geral:** indicadores operacionais, meta diária, ordens recentes, estoque e lembretes.
- **Ordens de serviço:** orçamento com aprovação, mesa técnica por etapa, catálogo com preenchimento automático, peças vinculadas com reserva e devolução automática do estoque, checklist de entrada, condições do aparelho, acessórios, fotos privadas, IMEI, prazos, garantia e acompanhamento de status.
- **Clientes:** cadastro, dados de contato e histórico de atendimento.
- **Agenda:** organização dos compromissos e da rotina da assistência.
- **Produtos e estoque:** preços, custos, SKU, estoque mínimo e movimentações.
- **Serviços:** catálogo de reparos com preço, custo, duração, garantia e descrição técnica padrão.
- **Vendas / PDV:** atendimento de balcão, registro de vendas e cobrança segura pelo Stripe Checkout.
- **Contas a pagar:** controle de vencimentos e confirmação de pagamentos.
- **Relatórios:** lucro real, margens, produtividade, conversão de orçamentos, oportunidades pendentes e valores recusados.
- **Configurações:** sub-abas Empresa, Administrador, Documentos, Operação, Avisos e Privacidade, reunindo nome, slogan, CNPJ, responsável, endereço, anexos empresariais e preferências da loja em um único formulário.

A plataforma também oferece busca global, notificações, consulta de IMEI por proxy seguro, mensagens de WhatsApp por etapa, pós-venda com link para avaliação no Google e documentos profissionais em A4, bobina térmica de 80 mm e etiqueta de 58 mm. A impressão do navegador permite salvar orçamento e ordem de serviço em PDF. Toda a navegação é adaptada para computador, tablet e celular.

## Como rodar

É necessário Node.js 20 ou superior.

```bash
npm start
```

Abra `http://localhost:4173`.

Instale as dependências e inicie o servidor:

```bash
npm install
npm start
```

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
   - `CELLF_ADMIN_EMAIL`: e-mail exigido para entrar na aplicação.
   - `CELLF_APP_PASSWORD_HASH`: hash `scrypt` com salt da senha; a senha original nunca precisa ficar no repositório. `CELLF_APP_PASSWORD` continua aceito somente para compatibilidade com instalações antigas.
   - `CELLF_AUTH_SECRET`: segredo longo e aleatório usado para assinar a sessão.
3. Opcionalmente, personalize `SUPABASE_STATE_ID` e `SUPABASE_DOCUMENT_BUCKET` se precisar separar ambientes ou alterar o nome do bucket.
4. Reinicie o servidor e faça login com o e-mail e a senha configurados.

O navegador conversa apenas com as rotas `/api/session`, `/api/state` e `/api/documents`; a chave privilegiada permanece no servidor. A sessão é protegida por um cookie assinado `HttpOnly`, e documentos e fotos das ordens são enviados e baixados por URLs assinadas com validade limitada.

### Publicação na Vercel

Cadastre as mesmas variáveis de ambiente nas configurações do projeto na Vercel e publique novamente. Nunca coloque `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CELLF_APP_PASSWORD`, `CELLF_APP_PASSWORD_HASH` ou `CELLF_AUTH_SECRET` em arquivos públicos, no JavaScript do navegador ou no repositório.

## Configurar pagamentos com Stripe

1. Conecte uma conta Stripe ao projeto pela Vercel Marketplace ou crie as chaves no painel da Stripe.
2. Configure `STRIPE_SECRET_KEY` somente no ambiente do servidor.
3. Na Stripe, crie um endpoint de webhook apontando para `https://cellf.com.br/api/stripe/webhook`.
4. Assine os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` e `checkout.session.expired`.
5. Copie o segredo de assinatura do endpoint para `STRIPE_WEBHOOK_SECRET` na Vercel e faça uma nova publicação.

O PDV cria uma venda pendente antes de abrir o Checkout. A baixa do estoque, a entrega e a confirmação financeira só acontecem depois que o servidor valida o pagamento com a Stripe. As formas de pagamento habilitadas na conta — como cartão, Pix e carteiras compatíveis — são selecionadas dinamicamente pela própria Stripe. Nenhuma chave secreta ou dado de cartão é enviado ao JavaScript público da Cellf.

## Configurar a consulta de IMEI

1. Crie uma conta na Infosimples e obtenha o token.
2. Copie `.env.example` para `.env`.
3. Preencha `INFOSIMPLES_TOKEN`.
4. Reinicie o servidor.

O navegador chama apenas `POST /api/imei`; o token permanece no servidor. A URL da consulta pode ser ajustada com `INFOSIMPLES_ENDPOINT` caso a sua conta informe um endpoint diferente.

## Segurança dos dados

A tabela de estado utiliza RLS e não concede leitura ou escrita às funções públicas. Os documentos permanecem em um bucket privado, com limite de 10 MB por arquivo e validação de formato. Sem credenciais de Supabase ou sem os segredos da sessão, as rotas protegidas recusam o acesso em vez de recorrer a armazenamento local desprotegido.
