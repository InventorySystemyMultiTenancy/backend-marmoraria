import { Request, Response } from 'express';
import { prisma } from '../../config/database';

export async function summary(req: Request, res: Response) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [quotesThisMonth, ordersInProgress, financialThisMonth, recentQuotes, lowStockMarbles] =
    await Promise.all([
      prisma.quote.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.order.count({ where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } } }),
      prisma.financialEntry.findMany({ where: { date: { gte: startOfMonth } } }),
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

  const revenue = financialThisMonth.filter((e) => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0);
  const expense = financialThisMonth.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);

  res.json({
    quotesThisMonth,
    ordersInProgress,
    revenue,
    expense,
    profit: revenue - expense,
    recentQuotes,
    lowStockCount: lowStockMarbles.length,
  });
}

export async function topProducts(req: Request, res: Response) {
  const grouped = await prisma.quoteItem.groupBy({
    by: ['marbleId'],
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
  const grouped = await prisma.quote.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  res.json({ data: grouped.map((g) => ({ status: g.status, count: g._count.id })) });
}
