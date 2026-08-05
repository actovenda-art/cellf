# Cellf — gestão de assistência e loja

Primeira versão funcional de um sistema interno para uma empresa de conserto de celulares e venda de produtos. Nesta etapa os dados ficam no `localStorage` do navegador; a camada visual e os fluxos já foram separados por domínio para a próxima conexão com o Supabase.

## O que já funciona

- painel com indicadores, ordens recentes, alertas de estoque e lembretes;
- produtos, preço, custo, SKU, estoque mínimo e movimentação de saldo;
- catálogo de serviços com preço fixo ou valor a consultar;
- ordens de serviço com cliente, aparelho, IMEI, defeito, prazo, valor e lembrete;
- atualização de status das ordens;
- contas a pagar com vencimento e baixa;
- busca global por ordem, cliente, aparelho, IMEI, produto ou serviço;
- consulta de IMEI por proxy no servidor, sem expor o token da Infosimples;
- interface responsiva para computador, tablet e celular.

## Como rodar

É necessário Node.js 20 ou superior.

```bash
npm start
```

Abra `http://localhost:4173`.

Não há dependências de terceiros, portanto não é necessário executar `npm install`.

## Configurar a consulta de IMEI

1. Crie uma conta na Infosimples e obtenha o token.
2. Copie `.env.example` para `.env`.
3. Preencha `INFOSIMPLES_TOKEN`.
4. Reinicie o servidor.

O navegador chama apenas `POST /api/imei`; o token permanece no servidor. A URL da consulta pode ser ajustada com `INFOSIMPLES_ENDPOINT` caso a sua conta informe um endpoint diferente.

## Próxima etapa: Supabase

A conexão deve substituir o adaptador local por um repositório Supabase. A arquitetura de tabelas sugerida está em [`docs/supabase-plan.md`](docs/supabase-plan.md). Recomenda-se incluir autenticação, RLS por empresa, trilha de movimentações de estoque e histórico de status das ordens já na primeira migração.
