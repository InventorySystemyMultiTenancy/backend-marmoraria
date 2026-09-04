-- Backfill: lança a receita retroativa dos pedidos aprovados antes da mudança
-- que passou a registrar a receita no momento da aprovação do orçamento.
-- Idempotente: pode rodar mais de uma vez sem duplicar (o NOT EXISTS filtra
-- pedidos que já têm o lançamento de "Venda").

INSERT INTO "FinancialEntry" (id, type, category, description, amount, date, "orderId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'INCOME',
  'Venda',
  'Orçamento ' || q."quoteNumber" || ' aprovado (lançamento retroativo)',
  q.total,
  o."createdAt",
  o.id,
  now(),
  now()
FROM "Order" o
JOIN "Quote" q ON q.id = o."quoteId"
WHERE o.status <> 'CANCELLED'
  AND NOT EXISTS (
    SELECT 1 FROM "FinancialEntry" fe
    WHERE fe."orderId" = o.id AND fe.type = 'INCOME' AND fe.category = 'Venda'
  );
