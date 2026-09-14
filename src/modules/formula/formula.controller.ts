import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import {
  evaluateFormula,
  evaluateFormulaBreakdown,
  FORMULA_VARIABLE_DOCS,
  DEFAULT_FORMULA_EXPRESSION,
} from '../../utils/formulaEngine';
import { AppError } from '../../middlewares/errorHandler';

const updateSchema = z.object({
  expression: z.string().min(1).max(500),
  description: z.string().optional(),
});

const testSchema = z.object({
  expression: z.string().min(1).max(500),
  width: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().positive(),
  pricePerM2: z.number().nonnegative(),
  quantity: z.number().int().positive().default(1),
});

// Mesmas variáveis do testSchema, mas sem "expression" — usa sempre a fórmula
// ativa configurada em /admin/formula, e inclui os toggles de acabamento/
// instalação, já que esses custos só entram se o cliente/admin marcar a opção.
const previewSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().positive(),
  pricePerM2: z.number().nonnegative(),
  quantity: z.number().int().positive().default(1),
  includeAcabamento: z.boolean().default(false),
  includeInstalacao: z.boolean().default(false),
});

export async function getActive(req: Request, res: Response) {
  let formula = await prisma.formulaConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!formula) {
    formula = await prisma.formulaConfig.create({
      data: {
        expression: DEFAULT_FORMULA_EXPRESSION,
        variables: FORMULA_VARIABLE_DOCS,
        description: 'Fórmula padrão: área x preço por m² x quantidade',
        isActive: true,
      },
    });
  }

  res.json({ formula, variableDocs: FORMULA_VARIABLE_DOCS });
}

export async function getHistory(req: Request, res: Response) {
  const history = await prisma.formulaConfig.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  res.json({ history });
}

export async function test(req: Request, res: Response) {
  const { expression, ...variables } = testSchema.parse(req.body);
  const result = evaluateFormula(expression, variables);
  res.json({ result });
}

// Usada pela prévia de orçamento (admin e formulário público): calcula o preço
// com a MESMA fórmula ativa que o backend usa ao salvar o orçamento e gerar o
// PDF, para a prévia nunca divergir do valor final. Também devolve o
// detalhamento (material/acabamento/instalação) pra explicar ao cliente/admin
// de onde vem o valor, sem expor o texto da fórmula em si.
export async function previewPrice(req: Request, res: Response) {
  const { includeAcabamento, includeInstalacao, ...variables } = previewSchema.parse(req.body);
  const expression = await getCurrentExpression();
  const breakdown = evaluateFormulaBreakdown(expression, variables, includeAcabamento, includeInstalacao);
  res.json({ result: breakdown.unitPrice, ...breakdown });
}

export async function update(req: Request, res: Response) {
  const data = updateSchema.parse(req.body);

  evaluateFormula(data.expression, {
    width: 100,
    height: 100,
    thickness: 20,
    pricePerM2: 500,
    quantity: 1,
  });

  await prisma.formulaConfig.updateMany({ where: { isActive: true }, data: { isActive: false } });

  const formula = await prisma.formulaConfig.create({
    data: {
      expression: data.expression,
      description: data.description,
      variables: FORMULA_VARIABLE_DOCS,
      isActive: true,
      updatedById: req.user!.id,
    },
  });

  res.json({ formula });
}

export async function getCurrentExpression(): Promise<string> {
  const formula = await prisma.formulaConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!formula) throw new AppError('Nenhuma fórmula configurada', 500);
  return formula.expression;
}
