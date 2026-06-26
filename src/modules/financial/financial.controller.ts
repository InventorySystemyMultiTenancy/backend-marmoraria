import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { paginationParams } from '../../utils/helpers';

const entrySchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  category: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().positive(),
  date: z.string(),
  orderId: z.string().optional(),
  notes: z.string().optional(),
});

export async function list(req: Request, res: Response) {
  const { page, limit, skip } = paginationParams(req.query as Record<string, unknown>);
  const { type, category, from, to } = req.query as Record<string, string | undefined>;

  const where = {
    ...(type ? { type: type as never } : {}),
    ...(category ? { category } : {}),
    ...(from || to
      ? {
          date: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.financialEntry.findMany({ where, skip, take: limit, orderBy: { date: 'desc' } }),
    prisma.financialEntry.count({ where }),
  ]);

  res.json({ entries, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function summary(req: Request, res: Response) {
  const { from, to } = req.query as Record<string, string | undefined>;
  const dateFilter =
    from || to
      ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {};

  const entries = await prisma.financialEntry.findMany({ where: dateFilter });

  const income = entries.filter((e) => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
  const profit = income - expense;
  const margin = income > 0 ? (profit / income) * 100 : 0;

  const byCategory = entries.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + (e.type === 'INCOME' ? e.amount : -e.amount);
    return acc;
  }, {} as Record<string, number>);

  res.json({ income, expense, profit, margin, byCategory });
}

export async function monthly(req: Request, res: Response) {
  const months = 6;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const entries = await prisma.financialEntry.findMany({ where: { date: { gte: start } } });

  const result: { month: string; income: number; expense: number }[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    const monthEntries = entries.filter(
      (e) => e.date.getFullYear() === d.getFullYear() && e.date.getMonth() === d.getMonth()
    );
    result.push({
      month: label,
      income: monthEntries.filter((e) => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0),
      expense: monthEntries.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0),
    });
  }

  res.json({ data: result });
}

export async function create(req: Request, res: Response) {
  const data = entrySchema.parse(req.body);
  const entry = await prisma.financialEntry.create({ data: { ...data, date: new Date(data.date) } });
  res.status(201).json({ entry });
}

export async function update(req: Request, res: Response) {
  const data = entrySchema.partial().parse(req.body);
  const entry = await prisma.financialEntry.update({
    where: { id: req.params.id },
    data: { ...data, date: data.date ? new Date(data.date) : undefined },
  });
  res.json({ entry });
}

export async function remove(req: Request, res: Response) {
  await prisma.financialEntry.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
