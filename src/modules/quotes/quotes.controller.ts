import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { addBusinessDays, isValidCpfCnpj, onlyDigits, paginationParams } from '../../utils/helpers';
import { AppError } from '../../middlewares/errorHandler';
import * as quotesService from './quotes.service';

const quoteItemSchema = z.object({
  marbleId: z.string(),
  description: z.string().optional(),
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  thicknessMm: z.number().positive(),
  quantity: z.number().int().positive().default(1),
  extras: z.array(z.object({ name: z.string(), price: z.number() })).optional(),
});

const createQuoteSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  clientPhone: z.string().optional(),
  clientEmail: z.string().email().optional().or(z.literal('')),
  clientCpfCnpj: z.string().refine(isValidCpfCnpj, 'Informe um CPF ou CNPJ válido'),
  items: z.array(quoteItemSchema).min(1),
  discount: z.number().nonnegative().default(0),
  discountPct: z.number().min(0).max(100).default(0),
  freight: z.number().nonnegative().default(0),
  freightDistanceKm: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  validUntil: z.string().optional(),
  source: z.enum(['ADMIN', 'SELF_SERVICE']).default('ADMIN'),
});

export async function list(req: Request, res: Response) {
  const { page, limit, skip } = paginationParams(req.query as Record<string, unknown>);
  const { status, clientId, createdById } = req.query as Record<string, string | undefined>;

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(clientId ? { clientId } : {}),
    ...(createdById ? { createdById } : {}),
  };

  const [quotes, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { client: { select: { name: true } }, createdBy: { select: { name: true } } },
    }),
    prisma.quote.count({ where }),
  ]);

  res.json({ quotes, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function getOne(req: Request, res: Response) {
  const quote = await prisma.quote.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
      createdBy: { select: { name: true } },
      items: { include: { marble: { select: { name: true, imageUrls: true, pricePerM2: true } } } },
      order: true,
    },
  });
  if (!quote) throw new AppError('Orçamento não encontrado', 404);
  res.json({ quote });
}

export async function create(req: Request, res: Response) {
  const data = createQuoteSchema.parse(req.body);

  if (!data.clientId && !data.clientName) {
    throw new AppError('Informe um cliente cadastrado ou os dados do cliente avulso', 400);
  }

  const { calculated, subtotal, total } = await quotesService.buildQuoteTotals(
    data.items,
    data.discount,
    data.discountPct,
    data.freight
  );

  const quoteNumber = await quotesService.generateQuoteNumber();

  // createdById: for SELF_SERVICE quotes from the public storefront there's no
  // logged-in employee, so fall back to the first MASTER account as system owner.
  const createdById =
    req.user?.id ??
    (await prisma.user.findFirst({ where: { role: 'MASTER' } }))?.id;

  if (!createdById) throw new AppError('Nenhum usuário disponível para registrar o orçamento', 500);

  const clientCpfCnpj = onlyDigits(data.clientCpfCnpj);

  // Preenche o CPF/CNPJ do cliente cadastrado se ainda não tiver um salvo,
  // sem sobrescrever um valor já existente.
  if (data.clientId) {
    await prisma.client.updateMany({
      where: { id: data.clientId, cpfCnpj: null },
      data: { cpfCnpj: clientCpfCnpj },
    });
  }

  const quote = await prisma.quote.create({
    data: {
      quoteNumber,
      clientId: data.clientId,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      clientEmail: data.clientEmail || undefined,
      clientCpfCnpj,
      createdById,
      subtotal,
      discount: data.discount,
      discountPct: data.discountPct,
      freight: data.freight,
      freightDistanceKm: data.freightDistanceKm,
      total,
      notes: data.notes,
      validUntil: data.validUntil ? new Date(data.validUntil) : addBusinessDays(new Date(), 10),
      source: data.source,
      items: {
        create: data.items.map((item, idx) => ({
          marbleId: item.marbleId,
          description: item.description,
          widthCm: item.widthCm,
          heightCm: item.heightCm,
          thicknessMm: item.thicknessMm,
          quantity: item.quantity,
          areaM2: calculated[idx].areaM2,
          unitPrice: calculated[idx].unitPrice,
          totalPrice: calculated[idx].totalPrice,
          extras: item.extras ?? [],
        })),
      },
    },
    include: { items: true },
  });

  res.status(201).json({ quote });
}

export async function update(req: Request, res: Response) {
  const data = createQuoteSchema.partial().parse(req.body);
  const existing = await prisma.quote.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError('Orçamento não encontrado', 404);

  if (data.items) {
    const { calculated, subtotal, total } = await quotesService.buildQuoteTotals(
      data.items,
      data.discount ?? existing.discount,
      data.discountPct ?? existing.discountPct,
      data.freight ?? existing.freight
    );

    await prisma.quoteItem.deleteMany({ where: { quoteId: req.params.id } });

    const quote = await prisma.quote.update({
      where: { id: req.params.id },
      data: {
        clientId: data.clientId,
        clientName: data.clientName,
        clientPhone: data.clientPhone,
        clientEmail: data.clientEmail || undefined,
        clientCpfCnpj: data.clientCpfCnpj ? onlyDigits(data.clientCpfCnpj) : undefined,
        discount: data.discount,
        discountPct: data.discountPct,
        freight: data.freight,
        freightDistanceKm: data.freightDistanceKm,
        notes: data.notes,
        subtotal,
        total,
        items: {
          create: data.items.map((item, idx) => ({
            marbleId: item.marbleId,
            description: item.description,
            widthCm: item.widthCm,
            heightCm: item.heightCm,
            thicknessMm: item.thicknessMm,
            quantity: item.quantity,
            areaM2: calculated[idx].areaM2,
            unitPrice: calculated[idx].unitPrice,
            totalPrice: calculated[idx].totalPrice,
            extras: item.extras ?? [],
          })),
        },
      },
      include: { items: true },
    });
    return res.json({ quote });
  }

  const quote = await prisma.quote.update({
    where: { id: req.params.id },
    data: {
      clientId: data.clientId,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      clientEmail: data.clientEmail || undefined,
      clientCpfCnpj: data.clientCpfCnpj ? onlyDigits(data.clientCpfCnpj) : undefined,
      notes: data.notes,
    },
  });
  res.json({ quote });
}

export async function updateStatus(req: Request, res: Response) {
  const { status } = z
    .object({ status: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED']) })
    .parse(req.body);

  const quote = await prisma.quote.update({ where: { id: req.params.id }, data: { status } });

  if (status === 'APPROVED') {
    const orderNumber = await generateOrderNumber();
    await prisma.order.upsert({
      where: { quoteId: quote.id },
      create: { orderNumber, quoteId: quote.id },
      update: {},
    });
  }

  res.json({ quote });
}

async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.order.count({ where: { orderNumber: { startsWith: `PED-${year}-` } } });
  return `PED-${year}-${String(count + 1).padStart(4, '0')}`;
}

export async function remove(req: Request, res: Response) {
  await prisma.quote.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
