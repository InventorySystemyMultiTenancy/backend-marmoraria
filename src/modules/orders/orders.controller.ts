import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { isValidCpfCnpj, onlyDigits, paginationParams } from '../../utils/helpers';
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

    if (data.status === 'CANCELLED') {
      await prisma.quote.update({ where: { id: order.quoteId }, data: { status: 'CANCELLED' } });
      // A receita já foi lançada na aprovação do orçamento — cancelar o pedido
      // precisa reverter esse lançamento para não inflar o faturamento.
      await prisma.financialEntry.deleteMany({
        where: { orderId: order.id, type: 'INCOME', category: 'Venda' },
      });
    }
  }

  res.json({ order });
}

export async function listStageOptions(req: Request, res: Response) {
  res.json({ stages: STAGE_NAMES });
}

const applyDiscountSchema = z.object({
  discount: z.number().nonnegative().default(0),
  discountPct: z.number().min(0).max(100).default(0),
});

// Aplica um desconto (valor fixo e/ou percentual) sobre o orçamento vinculado
// ao pedido e recalcula o total. A receita já foi lançada na aprovação, então
// o lançamento financeiro correspondente é atualizado para não ficar divergente.
export async function applyDiscount(req: Request, res: Response) {
  const data = applyDiscountSchema.parse(req.body);

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { quote: true },
  });
  if (!order) throw new AppError('Pedido não encontrado', 404);

  const pctDiscountValue = order.quote.subtotal * (data.discountPct / 100);
  const total = Math.max(0, order.quote.subtotal - data.discount - pctDiscountValue + order.quote.freight);

  await prisma.quote.update({
    where: { id: order.quoteId },
    data: { discount: data.discount, discountPct: data.discountPct, total },
  });

  const financialEntry = await prisma.financialEntry.findFirst({
    where: { orderId: order.id, type: 'INCOME', category: 'Venda' },
  });
  if (financialEntry) {
    await prisma.financialEntry.update({ where: { id: financialEntry.id }, data: { amount: total } });
  }

  const updated = await prisma.order.findUnique({
    where: { id: order.id },
    include: {
      quote: { include: { client: true, items: { include: { marble: true } } } },
      assignedTo: { select: { id: true, name: true } },
      stages: { orderBy: { createdAt: 'asc' } },
    },
  });

  res.json({ order: updated });
}

const trackOrderSchema = z
  .object({
    cpfCnpj: z.string().optional(),
    phone: z.string().optional(),
  })
  .refine((data) => Boolean(data.cpfCnpj?.trim() || data.phone?.trim()), {
    message: 'Informe o CPF/CNPJ ou o telefone usado no orçamento.',
  });

// Rota pública: busca todos os pedidos vinculados ao CPF/CNPJ ou ao telefone
// informado na hora de fazer o orçamento (do próprio cliente cadastrado ou do
// cliente avulso).
export async function trackOrder(req: Request, res: Response) {
  const { cpfCnpj, phone } = trackOrderSchema.parse(req.body);

  const baseInclude = {
    quote: { include: { client: true, items: { include: { marble: true } } } },
    stages: { orderBy: { createdAt: 'asc' as const } },
  };

  let orders;

  if (cpfCnpj?.trim()) {
    if (!isValidCpfCnpj(cpfCnpj)) {
      throw new AppError('Informe um CPF ou CNPJ válido', 400);
    }
    const normalized = onlyDigits(cpfCnpj);

    orders = await prisma.order.findMany({
      where: {
        quote: {
          OR: [{ clientCpfCnpj: normalized }, { client: { cpfCnpj: normalized } }],
        },
      },
      include: baseInclude,
      orderBy: { createdAt: 'desc' },
    });
  } else {
    const normalizedPhone = onlyDigits(phone!);
    if (normalizedPhone.length < 10) {
      throw new AppError('Informe um telefone válido com DDD', 400);
    }

    // O telefone não é normalizado no cadastro (pode estar salvo com máscara),
    // então comparamos apenas os dígitos em memória em vez de filtrar no banco.
    const candidates = await prisma.order.findMany({
      where: {
        quote: {
          OR: [{ clientPhone: { not: null } }, { client: { phone: { not: null } } }],
        },
      },
      include: baseInclude,
      orderBy: { createdAt: 'desc' },
    });

    orders = candidates.filter((order) => {
      const quotePhone = order.quote.clientPhone ? onlyDigits(order.quote.clientPhone) : null;
      const clientPhone = order.quote.client?.phone ? onlyDigits(order.quote.client.phone) : null;
      return quotePhone === normalizedPhone || clientPhone === normalizedPhone;
    });
  }

  if (orders.length === 0) {
    throw new AppError('Nenhum pedido encontrado para os dados informados.', 404);
  }

  res.json({
    orders: orders.map((order) => ({
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
    })),
  });
}
