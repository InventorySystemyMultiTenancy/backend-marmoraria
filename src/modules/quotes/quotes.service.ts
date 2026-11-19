import { prisma } from '../../config/database';
import { evaluateFormulaBreakdown } from '../../utils/formulaEngine';
import { calcAreaM2 } from '../../utils/helpers';
import { AppError } from '../../middlewares/errorHandler';

export interface QuoteItemInput {
  marbleId: string;
  description?: string;
  widthCm: number;
  heightCm: number;
  thicknessMm: number;
  quantity: number;
  extras?: { name: string; price: number }[];
  includeAcabamento?: boolean;
  includeInstalacao?: boolean;
}

async function getActiveExpression(): Promise<string> {
  const formula = await prisma.formulaConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!formula) throw new AppError('Nenhuma fórmula configurada', 500);
  return formula.expression;
}

export async function calculateItem(input: QuoteItemInput, expression: string) {
  const marble = await prisma.marble.findUnique({ where: { id: input.marbleId } });
  if (!marble) throw new AppError('Mármore não encontrado', 404);

  const areaM2 = calcAreaM2(input.widthCm, input.heightCm);
  const pricePerM2 = marble.pricePerM2 ?? 0;
  const includeAcabamento = input.includeAcabamento === true;
  const includeInstalacao = input.includeInstalacao === true;

  const { unitPrice, materialValue, acabamentoValue, instalacaoValue } = evaluateFormulaBreakdown(
    expression,
    { width: input.widthCm, height: input.heightCm, thickness: input.thicknessMm, pricePerM2, quantity: input.quantity },
    includeAcabamento,
    includeInstalacao
  );

  const extrasTotal = (input.extras ?? []).reduce((sum, e) => sum + e.price, 0);
  const totalPrice = unitPrice * input.quantity + extrasTotal;

  return {
    marble,
    areaM2,
    unitPrice,
    totalPrice,
    includeAcabamento,
    includeInstalacao,
    materialValue,
    acabamentoValue,
    instalacaoValue,
  };
}

export async function generateQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.quote.count({
    where: { quoteNumber: { startsWith: `ORC-${year}-` } },
  });
  return `ORC-${year}-${String(count + 1).padStart(4, '0')}`;
}

export async function buildQuoteTotals(
  items: QuoteItemInput[],
  discount: number,
  discountPct: number,
  freight = 0
) {
  const expression = await getActiveExpression();
  const calculated = await Promise.all(items.map((item) => calculateItem(item, expression)));

  const subtotal = calculated.reduce((sum, c) => sum + c.totalPrice, 0);
  const pctDiscountValue = subtotal * (discountPct / 100);
  const total = Math.max(0, subtotal - discount - pctDiscountValue + freight);

  return { calculated, subtotal, total };
}

// Exclusão definitiva de um orçamento e de tudo que depende dele: o pedido
// gerado na aprovação, as etapas desse pedido e os lançamentos financeiros
// vinculados ao pedido (a receita lançada na aprovação). Os itens do orçamento
// são apagados em cascata pelo banco. Tudo numa transação: ou apaga tudo, ou nada.
export async function deleteQuoteCascade(quoteId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { quoteId }, select: { id: true } });
    if (order) {
      await tx.financialEntry.deleteMany({ where: { orderId: order.id } });
      await tx.orderStage.deleteMany({ where: { orderId: order.id } });
      await tx.order.delete({ where: { id: order.id } });
    }
    await tx.quote.delete({ where: { id: quoteId } });
  });
}
