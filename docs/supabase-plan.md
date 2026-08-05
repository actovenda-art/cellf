# Plano de dados para o Supabase

Este documento é uma proposta para a próxima etapa. Nenhuma tabela foi criada ainda.

## Entidades principais

- `companies`: empresa dona dos dados, permitindo crescer para mais de uma unidade.
- `profiles`: usuários internos, função e vínculo com a empresa.
- `customers`: clientes e dados de contato.
- `products`: cadastro comercial, custo, preço, SKU e estoque mínimo.
- `stock_movements`: livro-razão imutável de entradas, saídas e ajustes; o saldo pode ser derivado ou mantido por função transacional.
- `service_catalog`: serviços, categoria, duração e modelo de preço (`fixed` ou `quote`).
- `work_orders`: ordem, cliente, aparelho, IMEI, relato, valor, prazo e status atual.
- `work_order_services`: serviços e valores efetivamente aplicados em cada ordem.
- `work_order_products`: peças/produtos consumidos na ordem, ligados a movimentos de estoque.
- `work_order_status_history`: histórico auditável de mudanças de status.
- `reminders`: lembretes ligados a ordens, com data, responsável e estado de conclusão.
- `payables`: contas a pagar, fornecedor, categoria, valor, vencimento e baixa.
- `imei_queries`: histórico opcional das consultas, resposta normalizada e usuário responsável.

## Regras importantes

- todas as tabelas operacionais terão `company_id`, `created_at`, `updated_at` e, quando aplicável, `created_by`;
- RLS deve limitar cada usuário aos dados de sua empresa;
- IMEI e telefones são dados sensíveis: acesso interno, registros mínimos e política de retenção;
- alterações de estoque devem ocorrer somente por movimentos, nunca editando saldo sem trilha;
- valores monetários usam `numeric(12,2)`, nunca ponto flutuante;
- status e tipos usam enums ou constraints controladas;
- exclusão de registros financeiros e operacionais deve ser lógica (`archived_at`) ou bloqueada.

## Ordem sugerida de implementação

1. autenticação, empresas e perfis;
2. produtos, serviços e clientes;
3. ordens, itens, status e lembretes;
4. movimentos de estoque transacionais;
5. contas a pagar;
6. histórico de consultas de IMEI e relatórios.
