import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';

const companySchema = z.object({
  name: z.string().min(1),
  cnpj: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  logoUrl: z.string().optional(),
});

export async function getPublic(req: Request, res: Response) {
  const company = await prisma.company.findFirst({
    select: { name: true, whatsapp: true, phone: true, email: true, logoUrl: true, address: true },
  });
  res.json({ company });
}

export async function getOne(req: Request, res: Response) {
  const company = await prisma.company.findFirst();
  res.json({ company });
}

export async function upsert(req: Request, res: Response) {
  const data = companySchema.parse(req.body);
  const existing = await prisma.company.findFirst();

  const company = existing
    ? await prisma.company.update({ where: { id: existing.id }, data: { ...data, email: data.email || undefined } })
    : await prisma.company.create({ data: { ...data, email: data.email || undefined } });

  res.json({ company });
}
