import { prisma } from '../../config/database';
import { evaluateFormula } from '../../utils/formulaEngine';
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

  const unitPrice = evaluateFormula(expression, {
    width: input.widthCm,
    height: input.heightCm,
    thickness: input.thicknessMm,
    pricePerM2,
    quantity: input.quantity,
  });

  const extrasTotal = (input.extras ?? []).reduce((sum, e) => sum + e.price, 0);
  const totalPrice = unitPrice * input.quantity + extrasTotal;

  return { marble, areaM2, unitPrice, totalPrice };
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
  discountPct: number
) {
  const expression = await getActiveExpression();
  const calculated = await Promise.all(items.map((item) => calculateItem(item, expression)));

  const subtotal = calculated.reduce((sum, c) => sum + c.totalPrice, 0);
  const pctDiscountValue = subtotal * (discountPct / 100);
  const total = Math.max(0, subtotal - discount - pctDiscountValue);

  return { calculated, subtotal, total };
}
