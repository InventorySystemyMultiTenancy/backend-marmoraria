import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { paginationParams } from '../../utils/helpers';
import { AppError } from '../../middlewares/errorHandler';
import { uploadBufferToCloudinary } from '../../config/cloudinary';

const marbleSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  origin: z.string().optional(),
  color: z.string().optional(),
  type: z.enum(['MARBLE', 'GRANITE', 'QUARTZITE', 'PORCELAIN', 'LIMESTONE', 'TRAVERTINE', 'OTHER']).default('MARBLE'),
  pricePerM2: z.number().positive().optional().nullable(),
  thickness: z.number().positive().optional().nullable(),
  isAvailable: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export async function listAdmin(req: Request, res: Response) {
  const { page, limit, skip } = paginationParams(req.query as Record<string, unknown>);
  const search = (req.query.search as string) || '';

  const where = search ? { name: { contains: search, mode: 'insensitive' as const } } : {};

  const [marbles, total] = await Promise.all([
    prisma.marble.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.marble.count({ where }),
  ]);

  res.json({ marbles, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function listPublic(req: Request, res: Response) {
  const { page, limit, skip } = paginationParams(req.query as Record<string, unknown>);
  const { type, color, search } = req.query as Record<string, string | undefined>;

  const where = {
    isPublic: true,
    isAvailable: true,
    ...(type ? { type: type as never } : {}),
    ...(color ? { color: { contains: color, mode: 'insensitive' as const } } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [marbles, total] = await Promise.all([
    prisma.marble.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.marble.count({ where }),
  ]);

  res.json({ marbles, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function getOne(req: Request, res: Response) {
  const marble = await prisma.marble.findUnique({ where: { id: req.params.id } });
  if (!marble) throw new AppError('Mármore não encontrado', 404);
  res.json({ marble });
}

export async function create(req: Request, res: Response) {
  const data = marbleSchema.parse({
    ...req.body,
    pricePerM2: req.body.pricePerM2 ? Number(req.body.pricePerM2) : null,
    thickness: req.body.thickness ? Number(req.body.thickness) : null,
  });
  const marble = await prisma.marble.create({ data: { ...data, imageUrls: [] } });
  res.status(201).json({ marble });
}

export async function update(req: Request, res: Response) {
  const data = marbleSchema.partial().parse({
    ...req.body,
    pricePerM2: req.body.pricePerM2 !== undefined ? Number(req.body.pricePerM2) || null : undefined,
    thickness: req.body.thickness !== undefined ? Number(req.body.thickness) || null : undefined,
  });
  const marble = await prisma.marble.update({ where: { id: req.params.id }, data });
  res.json({ marble });
}

export async function remove(req: Request, res: Response) {
  await prisma.marble.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

export async function uploadImages(req: Request, res: Response) {
  const files = (req.files as Express.Multer.File[]) || [];
  if (!files.length) throw new AppError('Nenhuma imagem enviada', 400);

  const urls = await Promise.all(files.map((file) => uploadBufferToCloudinary(file.buffer)));

  const marble = await prisma.marble.update({
    where: { id: req.params.id },
    data: { imageUrls: { push: urls } },
  });

  res.json({ marble });
}
