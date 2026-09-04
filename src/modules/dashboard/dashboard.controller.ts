import { Request, Response } from 'express';
import { prisma } from '../../config/database';

// Sem `from`/`to` na query, o painel mantém o comportamento padrão (mês
// corrente); quando informados, os cartões e gráficos passam a refletir o
// período escolhido (30 dias, 90 dias ou uma data específica).
function resolveRange(req: Request): { start: Date; end: Date } {
  const { from, to } = req.query as Record<string, string | undefined>;

  if (from || to) {
    const end = to ? new Date(to) : new Date();
    end.setHours(23, 59, 59, 999);
    return {
      start: from ? new Date(from) : new Date(0),
      end,
    };
  }

  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
}

export async function summary(req: Request, res: Response) {
  const { start, end } = resolveRange(req);

  const [quotesCount, ordersInProgress, financialInPeriod, recentQuotes, lowStockMarbles] =
    await Promise.all([
      prisma.quote.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.order.count({ where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } } }),
      prisma.financialEntry.findMany({ where: { date: { gte: start, lte: end } } }),
      prisma.quote.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { client: { select: { name: true } } },
      }),
      prisma.stockItem.groupBy({
        by: ['marbleId'],
        where: { status: 'AVAILABLE' },
        _count: { id: true },
        having: { id: { _count: { lt: 3 } } },
      }),
    ]);

  const revenue = financialInPeriod.filter((e) => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0);
  const expense = financialInPeriod.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);

  res.json({
    quotesCount,
    ordersInProgress,
    revenue,
    expense,
    profit: revenue - expense,
    recentQuotes,
    lowStockCount: lowStockMarbles.length,
  });
}

export async function topProducts(req: Request, res: Response) {
  const { start, end } = resolveRange(req);

  const grouped = await prisma.quoteItem.groupBy({
    by: ['marbleId'],
    where: { createdAt: { gte: start, lte: end } },
    _sum: { totalPrice: true, areaM2: true },
    _count: { id: true },
    orderBy: { _sum: { totalPrice: 'desc' } },
    take: 6,
  });

  const marbles = await prisma.marble.findMany({
    where: { id: { in: grouped.map((g) => g.marbleId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(marbles.map((m) => [m.id, m.name]));

  const products = grouped.map((g) => ({
    marbleId: g.marbleId,
    name: nameById.get(g.marbleId) ?? 'Mármore removido',
    totalRevenue: g._sum.totalPrice ?? 0,
    totalAreaM2: g._sum.areaM2 ?? 0,
    count: g._count.id,
  }));

  res.json({ products });
}

export async function quotesByStatus(req: Request, res: Response) {
  const { start, end } = resolveRange(req);

  const grouped = await prisma.quote.groupBy({
    by: ['status'],
    where: { createdAt: { gte: start, lte: end } },
    _count: { id: true },
  });

  res.json({ data: grouped.map((g) => ({ status: g.status, count: g._count.id })) });
}
