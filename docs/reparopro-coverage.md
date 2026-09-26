# CELLF: cobertura funcional e verificação

Referência conferida: [oferta pública da Reparopro](https://reparopro.com.br/oferta-4), em 25–26/09/2026. A comparação cobre os recursos descritos nessa página; não representa uma auditoria da área privada de outro fornecedor nem uma promessa de comportamento idêntico em funcionalidades não demonstradas publicamente.

## Recursos disponíveis

| Necessidade | Implementação na CELLF |
|---|---|
| OS digital | Cadastro, orçamento, aprovação/recusa, etapas e bancada sem limite artificial de quatro OS |
| Checklist | OK, atenção ou não testado; leitura de checklists antigos preservada |
| Evidências | Condição de entrada, acessórios e fotos privadas com data |
| Assinatura | Traços feitos com dedo/mouse, nome, declaração, data e cópia do checklist no momento da assinatura; impressão na OS |
| Documentos | OS, orçamento, recibo de valores recebidos, garantia e comprovante com CPF/CNPJ |
| Impressão | A4/PDF pelo navegador, comprovante 80 mm e etiqueta 58 mm com a marca CELLF |
| Clientes | Contato, CPF/CNPJ, histórico completo de OS e compras; endereço permanece no pedido/OS |
| Relacionamento | Aniversários do mês e mensagem individual preparada somente com autorização promocional registrada |
| Estoque | Cadastro, custo/preço, mínimo, entradas/saídas, reserva de peças por OS e baixa por venda |
| Catálogo de reparos | Serviço, preço/custo, descrição técnica e garantia |
| PDV integrado | Produtos vinculados à OS e opção de receber o saldo do serviço junto; desconto somente em produtos; faturamento do serviço contado uma vez |
| Caixa | Abertura, suprimento, sangria, recebimentos parciais, fechamento contado/esperado e diferença |
| Financeiro | Contas a pagar e contas a receber; ordens antigas entregues preservam a convenção histórica de quitação |
| Relatórios | Lucro total, lucro médio/serviço, lucro médio/produto, serviços/dia e produtos/dia destacados; relatórios por período |
| Equipe | Login próprio, acesso por módulo, bloqueio/desativação e invalidação das sessões anteriores |
| Proteção financeira | Custos excluídos da resposta do servidor para colaboradores sem acesso; edição não apaga os custos privados |
| Aparelhos | Novo/seminovo/recondicionado, IMEI, bateria, memória, cor, procedência, preço e fotos |
| Vitrine | Publicação explícita em `/vitrine`, fotos autorizadas e contato por WhatsApp; sem IMEI/custo/procedência; aparelho sem estoque não aparece |
| Logística | Entrega, busca e leva, venda balcão e serviço em loja |
| Agenda | Compromissos, lembretes, prazos e movimentações |
| Nuvem | Dados e usuários no Supabase; documentos em Storage privado; não usa armazenamento local como banco |
| Concorrência | Salvamento e confirmação Stripe com comparação da versão para não sobrescrever edição simultânea; conflito exige recarregar e reaplicar a alteração |
| Mobile/PWA | Ícones oficiais, safe area, enquadramento da apresentação, cabeçalho restrito à barra e controles responsivos |
| Identidade | Marca oficial CELLF e valores em BRL; não foi adicionado seletor multimoeda ou personalização de marca de terceiros |

## Pendências externas confirmadas

- **Emissão fiscal real:** ainda não integrada. O usuário informou não possuir A1. É necessário escolher o serviço emissor e validar credenciamento, certificado e requisitos aplicáveis com o contador. Não há botão de emissão fictícia. O CSV de movimento para o contador está disponível, mas não substitui XML autorizado, DANFE ou nota fiscal.
- **WhatsApp automático:** o usuário informou não possuir API oficial/provedor. Os atalhos manuais para orçamento, status, pós-venda e aniversário estão disponíveis. Não há disparos automáticos, envio em massa ou garantia de entrega de mensagens sem essa integração.
- **Stripe:** implementação e testes de Checkout/webhook existentes, incluindo cobrança conjunta e repetição de eventos. Os testes desta revisão não cobram cartões reais nem comprovam aprovação comercial da conta.

## Limites de validação

- Testes Node: autenticação, APIs, permissões, preservação de dados, relatórios, pagamentos e funções existentes.
- `scripts/review-responsive.mjs`: 104 telas/estados em Chromium e WebKit, nas larguras 320, 390, 768 e 1440; verifica erro de JavaScript, página sem conteúdo e estouro horizontal.
- `scripts/review-workflows.mjs`: caixa, retirada, recebimento parcial, falha de rede e repetição sem duplicidade, cobrança combinada, baixa do aparelho, assinatura e recarga.
- Fluxos automatizados usam dados isolados e respostas simuladas para não gerar clientes, vendas ou cobranças na produção. Os testes de API exercitam os handlers reais com o transporte Supabase simulado.
- WebKit automatizado não substitui um teste físico no iPhone. A assinatura é um registro de aceite, não uma assinatura qualificada com certificado A1.
- Não afirmar “100% idêntico à Reparopro”: além das dependências acima, funcionalidades exclusivas da área privada não foram demonstradas. A adaptação usa a identidade CELLF e BRL, não um editor genérico de marcas/moedas.

## Persistência

Os novos registros operacionais são coleções do estado existente `cellf_app_state`. A equipe fica em outra linha, com sufixo `-team`, nunca enviada no estado comum. Senhas são armazenadas como hash scrypt, e somente o backend usa a chave privilegiada do Supabase. Nenhuma migração ou substituição dos dados reais foi executada nesta revisão.
