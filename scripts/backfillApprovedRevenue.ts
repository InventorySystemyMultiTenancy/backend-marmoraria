// Script único: lança a receita retroativa dos pedidos que já foram aprovados
// antes da mudança que passou a registrar a receita no momento da aprovação
// do orçamento. Sem isso, esses pedidos antigos nunca vão aparecer no
// financeiro/dashboard porque a receita deles nunca chegou a ser criada.
//
// Uso: npm run backfill:revenue
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    where: { status: { not: 'CANCELLED' } },
    include: { quote: true },
  });

  let created = 0;

  for (const order of orders) {
    const existingEntry = await prisma.financialEntry.findFirst({
      where: { orderId: order.id, type: 'INCOME', category: 'Venda' },
    });
    if (existingEntry) continue;

    await prisma.financialEntry.create({
      data: {
        type: 'INCOME',
        category: 'Venda',
        description: `Orçamento ${order.quote.quoteNumber} aprovado (lançamento retroativo)`,
        amount: order.quote.total,
        date: order.createdAt,
        orderId: order.id,
      },
    });
    created++;
    console.log(`Receita lançada para o pedido ${order.orderNumber} (${order.quote.quoteNumber}): R$ ${order.quote.total.toFixed(2)}`);
  }

  console.log('---');
  console.log(`Concluído! ${created} lançamento(s) de receita criado(s) de ${orders.length} pedido(s) verificado(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
