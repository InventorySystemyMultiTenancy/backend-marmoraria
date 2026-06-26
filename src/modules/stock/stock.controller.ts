import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { paginationParams, calcAreaM2 } from '../../utils/helpers';
import { AppError } from '../../middlewares/errorHandler';

const stockSchema = z.object({
  marbleId: z.string(),
  slabNumber: z.string().optional(),
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  thicknessMm: z.number().positive(),
  costPrice: z.number().nonnegative().optional(),
  location: z.string().optional(),
  status: z.enum(['AVAILABLE', 'RESERVED', 'USED', 'DAMAGED']).optional(),
  notes: z.string().optional(),
});

export async function list(req: Request, res: Response) {
  const { page, limit, skip } = paginationParams(req.query as Record<string, unknown>);
  const { marbleId, status } = req.query as Record<string, string | undefined>;

  const where = {
    ...(marbleId ? { marbleId } : {}),
    ...(status ? { status: status as never } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.stockItem.findMany({
      where,
      skip,
      take: limit,
      orderBy: { entryDate: 'desc' },
      include: { marble: { select: { name: true, type: true } } },
    }),
    prisma.stockItem.count({ where }),
  ]);

  res.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function summary(req: Request, res: Response) {
  const items = await prisma.stockItem.findMany({ where: { status: 'AVAILABLE' } });
  const totalValue = items.reduce((sum, item) => sum + (item.costPrice ?? 0), 0);
  const totalAreaM2 = items.reduce((sum, item) => sum + item.areaM2, 0);
  res.json({ totalValue, totalAreaM2, totalItems: items.length });
}

export async function create(req: Request, res: Response) {
  const data = stockSchema.parse(req.body);
  const item = await prisma.stockItem.create({
    data: { ...data, areaM2: calcAreaM2(data.widthCm, data.heightCm) },
  });
  res.status(201).json({ item });
}

export async function update(req: Request, res: Response) {
  const data = stockSchema.partial().parse(req.body);
  const existing = await prisma.stockItem.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError('Item de estoque não encontrado', 404);

  const widthCm = data.widthCm ?? existing.widthCm;
  const heightCm = data.heightCm ?? existing.heightCm;

  const item = await prisma.stockItem.update({
    where: { id: req.params.id },
    data: { ...data, areaM2: calcAreaM2(widthCm, heightCm) },
  });
  res.json({ item });
}

export async function remove(req: Request, res: Response) {
  await prisma.stockItem.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
