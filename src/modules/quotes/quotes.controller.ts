import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { addBusinessDays, calcAreaM2, isValidCpfCnpj, onlyDigits, paginationParams } from '../../utils/helpers';
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
  // Acabamento/frontão e instalação só entram no preço se o cliente/admin marcar
  // a opção explicitamente — por isso o default é false, não true.
  includeAcabamento: z.boolean().default(false),
  includeInstalacao: z.boolean().default(false),
});

const createQuoteSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  clientPhone: z.string().optional(),
  clientEmail: z.string().email().optional().or(z.literal('')),
  clientCpfCnpj: z
    .string()
    .optional()
    .refine((v) => !v || isValidCpfCnpj(v), 'Informe um CPF ou CNPJ válido'),
  items: z.array(quoteItemSchema).min(1),
  discount: z.number().nonnegative().default(0),
  discountPct: z.number().min(0).max(100).default(0),
  freight: z.number().nonnegative().default(0),
  freightDistanceKm: z.number().nonnegative().optional(),
  freightRatePerKm: z.number().nonnegative().optional(),
  deliveryAddress: z.string().trim().max(500).optional(),
  // Custo adicional (extras) só aparece no PDF/acompanhamento se marcado.
  showExtras: z.boolean().default(false),
  projectName: z.string().trim().max(200).optional(),
  paymentConditions: z.string().trim().max(1000).optional(),
  paymentTerm: z.string().trim().max(1000).optional(),
  deliveryTerm: z.string().trim().max(1000).optional(),
  notes: z.string().optional(),
  validUntil: z.string().optional(),
  source: z.enum(['ADMIN', 'SELF_SERVICE']).default('ADMIN'),
});

type QuoteInfoInput = Partial<
  Pick<z.infer<typeof createQuoteSchema>, 'projectName' | 'paymentConditions' | 'paymentTerm' | 'deliveryTerm'>
>;

// Campo vazio vira null (some do PDF); campo omitido (undefined) não é alterado.
function quoteInfoFields(data: QuoteInfoInput) {
  const norm = (v: string | undefined) => (v === undefined ? undefined : v || null);
  return {
    projectName: norm(data.projectName),
    paymentConditions: norm(data.paymentConditions),
    paymentTerm: norm(data.paymentTerm),
    deliveryTerm: norm(data.deliveryTerm),
  };
}

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

  // CPF/CNPJ não é obrigatório para criar o orçamento — se não for informado agora,
  // é pedido depois, na aprovação, já que é o que permite o cliente rastrear o pedido.
  const clientCpfCnpj = data.clientCpfCnpj ? onlyDigits(data.clientCpfCnpj) : undefined;

  // Preenche o CPF/CNPJ do cliente cadastrado se ainda não tiver um salvo,
  // sem sobrescrever um valor já existente.
  if (data.clientId && clientCpfCnpj) {
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
      freightRatePerKm: data.freightRatePerKm,
      deliveryAddress: data.deliveryAddress || undefined,
      total,
      showExtras: data.showExtras,
      ...quoteInfoFields(data),
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
          includeAcabamento: calculated[idx].includeAcabamento,
          includeInstalacao: calculated[idx].includeInstalacao,
          materialValue: calculated[idx].materialValue,
          acabamentoValue: calculated[idx].acabamentoValue,
          instalacaoValue: calculated[idx].instalacaoValue,
          extras: item.extras ?? [],
        })),
      },
    },
    include: { items: true },
  });

  // Orçamento público (sem login): não devolve o detalhamento por item
  // (acabamento/frontão, instalação) — só o admin vê esses valores.
  if (!req.user) {
    return res.status(201).json({
      quote: { id: quote.id, quoteNumber: quote.quoteNumber, subtotal: quote.subtotal, total: quote.total },
    });
  }

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
        freightRatePerKm: data.freightRatePerKm,
        deliveryAddress: data.deliveryAddress,
        showExtras: data.showExtras,
        ...quoteInfoFields(data),
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
            includeAcabamento: calculated[idx].includeAcabamento,
            includeInstalacao: calculated[idx].includeInstalacao,
            materialValue: calculated[idx].materialValue,
            acabamentoValue: calculated[idx].acabamentoValue,
            instalacaoValue: calculated[idx].instalacaoValue,
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
      showExtras: data.showExtras,
      ...quoteInfoFields(data),
      notes: data.notes,
    },
  });
  res.json({ quote });
}

const updateItemValuesSchema = z.object({
  // Dimensões/quantidade da peça. Se omitidas, mantêm as atuais. Os valores
  // (material/acabamento/instalação) vêm já recalculados pelo front a partir da
  // prévia da fórmula — aqui só recalculamos a área e os totais.
  // Troca do material (mármore) da peça. Se omitido, mantém o atual.
  marbleId: z.string().min(1).optional(),
  description: z.string().trim().max(500).optional(),
  widthCm: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  thicknessMm: z.number().positive().optional(),
  quantity: z.number().int().positive().optional(),
  materialValue: z.number().nonnegative().optional(),
  acabamentoValue: z.number().nonnegative().optional(),
  instalacaoValue: z.number().nonnegative().optional(),
  // Custo adicional do item (ex: cuba de inox). Se omitido, mantém o atual.
  extras: z.array(z.object({ name: z.string().min(1), price: z.number().nonnegative() })).optional(),
});

const quoteDetailInclude = {
  client: true,
  createdBy: { select: { name: true } },
  items: { include: { marble: { select: { name: true, imageUrls: true, pricePerM2: true } } } },
  order: true,
} as const;

// Se o orçamento já virou pedido, a receita foi lançada na aprovação — o
// lançamento precisa acompanhar o novo total pra não ficar divergente.
async function syncOrderRevenue(quoteId: string, total: number) {
  const order = await prisma.order.findUnique({ where: { quoteId } });
  if (!order) return;
  await prisma.financialEntry.updateMany({
    where: { orderId: order.id, type: 'INCOME', category: 'Venda' },
    data: { amount: total },
  });
}

// Só o MASTER pode ajustar manualmente o valor de material/acabamento/instalação
// de um item — inclusive em orçamentos já aprovados —, por exemplo pra dar um
// desconto pontual num serviço sem mexer na fórmula geral. Campos omitidos
// mantêm o valor calculado (o "valor base"); só os informados são sobrescritos.
// Vale também para pedidos (orçamentos aprovados): a tela do pedido usa esta
// mesma rota, e o lançamento de receita acompanha o novo total.
export async function updateItemValues(req: Request, res: Response) {
  const data = updateItemValuesSchema.parse(req.body);

  const item = await prisma.quoteItem.findUnique({ where: { id: req.params.itemId } });
  if (!item || item.quoteId !== req.params.id) {
    throw new AppError('Item do orçamento não encontrado', 404);
  }

  if (data.marbleId && data.marbleId !== item.marbleId) {
    const marble = await prisma.marble.findUnique({ where: { id: data.marbleId }, select: { id: true } });
    if (!marble) throw new AppError('Mármore não encontrado', 404);
  }

  const materialValue = data.materialValue ?? item.materialValue;
  const acabamentoValue = data.acabamentoValue ?? item.acabamentoValue;
  const instalacaoValue = data.instalacaoValue ?? item.instalacaoValue;
  const unitPrice = materialValue + acabamentoValue + instalacaoValue;
  const widthCm = data.widthCm ?? item.widthCm;
  const heightCm = data.heightCm ?? item.heightCm;
  const thicknessMm = data.thicknessMm ?? item.thicknessMm;
  const quantity = data.quantity ?? item.quantity;
  const extras = data.extras ?? (item.extras as { name: string; price: number }[] | null) ?? [];
  const extrasTotal = extras.reduce((sum, e) => sum + e.price, 0);
  const totalPrice = unitPrice * quantity + extrasTotal;

  await prisma.quoteItem.update({
    where: { id: item.id },
    data: {
      ...(data.marbleId ? { marbleId: data.marbleId } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      widthCm,
      heightCm,
      thicknessMm,
      quantity,
      areaM2: calcAreaM2(widthCm, heightCm),
      materialValue,
      acabamentoValue,
      instalacaoValue,
      unitPrice,
      totalPrice,
      extras,
      valuesOverridden: true,
    },
  });

  const quote = await prisma.quote.findUnique({ where: { id: req.params.id }, include: { items: true } });
  if (!quote) throw new AppError('Orçamento não encontrado', 404);

  const subtotal = quote.items.reduce((sum, i) => sum + i.totalPrice, 0);
  const pctDiscountValue = subtotal * (quote.discountPct / 100);
  const total = Math.max(0, subtotal - quote.discount - pctDiscountValue + quote.freight);

  const updated = await prisma.quote.update({
    where: { id: req.params.id },
    data: { subtotal, total },
    include: quoteDetailInclude,
  });

  await syncOrderRevenue(req.params.id, total);

  res.json({ quote: updated });
}

// Liga/desliga a exibição do custo adicional (extras) no PDF e no
// acompanhamento do pedido. Não mexe em valores: o total já inclui os extras.
export async function updateShowExtras(req: Request, res: Response) {
  const { showExtras } = z.object({ showExtras: z.boolean() }).parse(req.body);

  const existing = await prisma.quote.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError('Orçamento não encontrado', 404);

  const quote = await prisma.quote.update({
    where: { id: req.params.id },
    data: { showExtras },
    include: quoteDetailInclude,
  });

  res.json({ quote });
}

const updateFreightSchema = z.object({
  deliveryAddress: z.string().trim().max(500).nullable().optional(),
  freightDistanceKm: z.number().nonnegative().nullable().optional(),
  freightRatePerKm: z.number().nonnegative().nullable().optional(),
  // Frete manual: usado só quando não há distância + taxa por km.
  freight: z.number().nonnegative().optional(),
});

// Edita endereço de entrega, distância e frete de um orçamento já criado,
// recalculando o total. Se há distância e taxa por km, o frete é
// distância × taxa; senão, vale o frete manual informado. Se o orçamento já
// foi aprovado, o lançamento de receita do pedido acompanha o novo total.
export async function updateFreight(req: Request, res: Response) {
  const data = updateFreightSchema.parse(req.body);

  const existing = await prisma.quote.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError('Orçamento não encontrado', 404);

  const distance = data.freightDistanceKm ?? null;
  const rate = data.freightRatePerKm ?? null;
  const freight =
    distance != null && rate != null && distance > 0 && rate > 0
      ? Math.round(distance * rate * 100) / 100
      : data.freight ?? 0;

  const pctDiscountValue = existing.subtotal * (existing.discountPct / 100);
  const total = Math.max(0, existing.subtotal - existing.discount - pctDiscountValue + freight);

  const quote = await prisma.quote.update({
    where: { id: req.params.id },
    data: {
      deliveryAddress: data.deliveryAddress === undefined ? undefined : data.deliveryAddress || null,
      freightDistanceKm: distance,
      freightRatePerKm: rate,
      freight,
      total,
    },
    include: quoteDetailInclude,
  });

  await syncOrderRevenue(req.params.id, total);

  res.json({ quote });
}

const updateClientInfoSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do cliente').max(200),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email('Informe um email válido').optional().or(z.literal('')),
  cpfCnpj: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isValidCpfCnpj(v), 'Informe um CPF ou CNPJ válido'),
  // Só existem no cadastro do cliente (cliente avulso não tem esses campos).
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(50).optional(),
});

// Edita nome e dados do cliente direto da tela do orçamento/pedido. Se o
// orçamento é de um cliente cadastrado, o cadastro dele também é atualizado
// (vale pra todos os orçamentos desse cliente) — por isso exige também a
// permissão de editar clientes. Os dados copiados no próprio orçamento são
// atualizados junto, pra todas as telas e o PDF mostrarem a mesma coisa.
export async function updateClientInfo(req: Request, res: Response) {
  const data = updateClientInfoSchema.parse(req.body);

  const existing = await prisma.quote.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError('Orçamento não encontrado', 404);

  const phone = data.phone || null;
  const email = data.email || null;
  const cpfCnpj = data.cpfCnpj ? onlyDigits(data.cpfCnpj) : null;

  if (existing.clientId) {
    const user = req.user;
    if (user?.role !== 'MASTER' && !user?.permissions?.clients_edit) {
      throw new AppError('Você não tem permissão para editar o cadastro do cliente', 403);
    }
    await prisma.client.update({
      where: { id: existing.clientId },
      data: {
        name: data.name,
        phone,
        email,
        cpfCnpj,
        ...(data.address !== undefined ? { address: data.address || null } : {}),
        ...(data.city !== undefined ? { city: data.city || null } : {}),
        ...(data.state !== undefined ? { state: data.state || null } : {}),
      },
    });
  }

  const quote = await prisma.quote.update({
    where: { id: req.params.id },
    data: { clientName: data.name, clientPhone: phone, clientEmail: email, clientCpfCnpj: cpfCnpj },
    include: quoteDetailInclude,
  });

  res.json({ quote });
}

const updateDiscountSchema = z.object({
  discount: z.number().nonnegative(),
  discountPct: z.number().min(0).max(100),
});

// Ajusta o desconto (R$ e/ou %) de um orçamento já criado, pela tela de
// detalhe no admin, recalculando o total. Se o orçamento já foi aprovado, o
// lançamento de receita do pedido acompanha o novo total.
export async function updateDiscount(req: Request, res: Response) {
  const { discount, discountPct } = updateDiscountSchema.parse(req.body);

  const existing = await prisma.quote.findUnique({ where: { id: req.params.id }, include: { order: true } });
  if (!existing) throw new AppError('Orçamento não encontrado', 404);

  const pctDiscountValue = existing.subtotal * (discountPct / 100);
  if (discount + pctDiscountValue > existing.subtotal) {
    throw new AppError('O desconto não pode ser maior que o subtotal do orçamento', 400);
  }
  const total = Math.max(0, existing.subtotal - discount - pctDiscountValue + existing.freight);

  const quote = await prisma.quote.update({
    where: { id: req.params.id },
    data: { discount, discountPct, total },
    include: quoteDetailInclude,
  });

  await syncOrderRevenue(req.params.id, total);

  res.json({ quote });
}

export async function updateStatus(req: Request, res: Response) {
  const { status, clientCpfCnpj } = z
    .object({
      status: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED']),
      clientCpfCnpj: z.string().optional(),
    })
    .parse(req.body);

  const existing = await prisma.quote.findUnique({
    where: { id: req.params.id },
    include: { client: { select: { cpfCnpj: true } } },
  });
  if (!existing) throw new AppError('Orçamento não encontrado', 404);

  // O CPF/CNPJ não é obrigatório para criar o orçamento, mas é o que permite o
  // cliente rastrear o pedido depois — por isso é exigido aqui, na aprovação,
  // caso ainda não tenha sido informado.
  let cpfCnpjToSave: string | undefined;
  if (status === 'APPROVED' && !existing.clientCpfCnpj && !existing.client?.cpfCnpj) {
    if (!clientCpfCnpj || !isValidCpfCnpj(clientCpfCnpj)) {
      throw new AppError('Informe o CPF ou CNPJ do cliente para aprovar o orçamento e permitir o rastreio do pedido.', 400);
    }
    cpfCnpjToSave = onlyDigits(clientCpfCnpj);
  }

  const quote = await prisma.quote.update({
    where: { id: req.params.id },
    data: { status, ...(cpfCnpjToSave ? { clientCpfCnpj: cpfCnpjToSave } : {}) },
  });

  if (cpfCnpjToSave && existing.clientId) {
    await prisma.client.updateMany({
      where: { id: existing.clientId, cpfCnpj: null },
      data: { cpfCnpj: cpfCnpjToSave },
    });
  }

  if (status === 'APPROVED') {
    const orderNumber = await generateOrderNumber();
    const order = await prisma.order.upsert({
      where: { quoteId: quote.id },
      create: { orderNumber, quoteId: quote.id },
      update: {},
    });

    // A receita é reconhecida assim que o orçamento é aprovado, não só na
    // entrega — por isso o lançamento é feito aqui. Protegido contra duplicação
    // caso a aprovação seja acionada mais de uma vez para o mesmo pedido.
    const existingEntry = await prisma.financialEntry.findFirst({
      where: { orderId: order.id, type: 'INCOME', category: 'Venda' },
    });
    if (!existingEntry) {
      await prisma.financialEntry.create({
        data: {
          type: 'INCOME',
          category: 'Venda',
          description: `Orçamento ${quote.quoteNumber} aprovado`,
          amount: quote.total,
          date: new Date(),
          orderId: order.id,
        },
      });
    }
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
