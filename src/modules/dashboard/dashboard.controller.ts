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
