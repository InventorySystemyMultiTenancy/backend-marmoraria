import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { paginationParams } from '../../utils/helpers';
import { AppError } from '../../middlewares/errorHandler';

const clientSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  cpfCnpj: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  notes: z.string().optional(),
});

export async function list(req: Request, res: Response) {
  const { page, limit, skip } = paginationParams(req.query as Record<string, unknown>);
  const search = (req.query.search as string) || '';

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [clients, total] = await Promise.all([
    prisma.client.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.client.count({ where }),
  ]);

  res.json({ clients, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function getOne(req: Request, res: Response) {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { quotes: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  if (!client) throw new AppError('Cliente não encontrado', 404);
  res.json({ client });
}

export async function create(req: Request, res: Response) {
  const data = clientSchema.parse(req.body);
  const client = await prisma.client.create({ data: { ...data, email: data.email || undefined } });
  res.status(201).json({ client });
}

export async function update(req: Request, res: Response) {
  const data = clientSchema.partial().parse(req.body);
  const client = await prisma.client.update({
    where: { id: req.params.id },
    data: { ...data, email: data.email || undefined },
  });
  res.json({ client });
}

export async function remove(req: Request, res: Response) {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
