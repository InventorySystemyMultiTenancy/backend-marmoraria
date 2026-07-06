import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { paginationParams } from '../../utils/helpers';
import { AppError } from '../../middlewares/errorHandler';

const STAGE_NAMES = ['Aprovado', 'Corte', 'Polimento', 'Acabamento', 'Pronto', 'Entregue'];

const STAGE_NAME_BY_STATUS: Record<string, string> = {
  PENDING: 'Aprovado',
  IN_CUTTING: 'Corte',
  IN_POLISHING: 'Polimento',
  IN_FINISHING: 'Acabamento',
  READY: 'Pronto',
  DELIVERED: 'Entregue',
};

const updateOrderSchema = z.object({
  status: z
    .enum(['PENDING', 'IN_CUTTING', 'IN_POLISHING', 'IN_FINISHING', 'READY', 'DELIVERED', 'CANCELLED'])
    .optional(),
  assignedToId: z.string().nullable().optional(),
  startDate: z.string().optional(),
  estimatedDate: z.string().optional(),
  completedDate: z.string().optional(),
  productionNotes: z.string().optional(),
  materialCost: z.number().nonnegative().optional(),
  laborCost: z.number().nonnegative().optional(),
});

export async function list(req: Request, res: Response) {
  const { page, limit, skip } = paginationParams(req.query as Record<string, unknown>);
  const { status, assignedToId } = req.query as Record<string, string | undefined>;

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(assignedToId ? { assignedToId } : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        quote: { include: { client: { select: { name: true } } } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  res.json({ orders, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function getOne(req: Request, res: Response) {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      quote: { include: { client: true, items: { include: { marble: true } } } },
      assignedTo: { select: { id: true, name: true } },
      stages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) throw new AppError('Pedido não encontrado', 404);
  res.json({ order });
}

export async function update(req: Request, res: Response) {
  const data = updateOrderSchema.parse(req.body);
  const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError('Pedido não encontrado', 404);

  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: {
      status: data.status,
      assignedToId: data.assignedToId,
      productionNotes: data.productionNotes,
      materialCost: data.materialCost,
      laborCost: data.laborCost,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      estimatedDate: data.estimatedDate ? new Date(data.estimatedDate) : undefined,
      completedDate: data.completedDate ? new Date(data.completedDate) : undefined,
    },
  });

  if (data.status && data.status !== existing.status) {
    await prisma.orderStage.create({
      data: {
        orderId: order.id,
        stageName: STAGE_NAME_BY_STATUS[data.status] ?? data.status,
        status: 'done',
        completedAt: new Date(),
      },
    });

    if (data.status === 'DELIVERED') {
      const quote = await prisma.quote.findUnique({ where: { id: order.quoteId } });
      if (quote) {
        await prisma.financialEntry.create({
          data: {
            type: 'INCOME',
            category: 'Venda',
            description: `Pedido ${order.orderNumber} entregue`,
            amount: quote.total,
            date: new Date(),
            orderId: order.id,
          },
        });
      }
    }
  }

  res.json({ order });
}

export async function listStageOptions(req: Request, res: Response) {
  res.json({ stages: STAGE_NAMES });
}

const trackOrderSchema = z.object({
  orderNumber: z.string().min(1, 'Informe o código do pedido'),
  phone: z.string().min(1, 'Informe o telefone'),
});

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

// Rota pública: o número do pedido é sequencial e previsível (ex: PED-2026-0001),
// então exigimos também o telefone cadastrado para evitar que qualquer pessoa
// veja dados de outros clientes só adivinhando o código.
export async function trackOrder(req: Request, res: Response) {
  const { orderNumber, phone } = trackOrderSchema.parse(req.body);

  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumber.trim().toUpperCase() },
    include: {
      quote: { include: { client: true, items: { include: { marble: true } } } },
      stages: { orderBy: { createdAt: 'asc' } },
    },
  });

  const storedPhone = order?.quote.client?.phone ?? order?.quote.clientPhone;
  if (!order || !storedPhone || onlyDigits(storedPhone) !== onlyDigits(phone)) {
    throw new AppError('Pedido não encontrado. Verifique o código e o telefone informados.', 404);
  }

  res.json({
    order: {
      orderNumber: order.orderNumber,
      status: order.status,
      startDate: order.startDate,
      estimatedDate: order.estimatedDate,
      completedDate: order.completedDate,
      createdAt: order.createdAt,
      stages: order.stages.map((s) => ({
        stageName: s.stageName,
        status: s.status,
        completedAt: s.completedAt,
      })),
      quote: {
        quoteNumber: order.quote.quoteNumber,
        clientName: order.quote.client?.name ?? order.quote.clientName,
        subtotal: order.quote.subtotal,
        discount: order.quote.discount,
        discountPct: order.quote.discountPct,
        freight: order.quote.freight,
        total: order.quote.total,
        items: order.quote.items.map((item) => ({
          marbleName: item.marble.name,
          marbleImage: item.marble.imageUrls[0] ?? null,
          description: item.description,
          widthCm: item.widthCm,
          heightCm: item.heightCm,
          thicknessMm: item.thicknessMm,
          quantity: item.quantity,
          areaM2: item.areaM2,
          totalPrice: item.totalPrice,
        })),
      },
    },
  });
}
