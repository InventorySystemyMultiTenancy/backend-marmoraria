import { create, all } from 'mathjs';

const math = create(all);

// "import" e "createUnit" permitiriam redefinir funções/unidades em tempo de
// avaliação; "evaluate" e "parse" NÃO entram aqui pois o próprio math.evaluate()
// depende deles internamente para compilar e rodar a expressão.
const DISABLED_FUNCTIONS = ['import', 'createUnit'];
math.import(
  DISABLED_FUNCTIONS.reduce((acc, name) => {
    acc[name] = () => {
      throw new Error(`Função "${name}" desabilitada por segurança`);
    };
    return acc;
  }, {} as Record<string, () => never>),
  { override: true }
);

const limitedEvaluate = math.evaluate;

export interface FormulaVariables {
  width: number;
  height: number;
  thickness: number;
  pricePerM2: number;
  quantity: number;
  [key: string]: number;
}

export function evaluateFormula(expression: string, variables: FormulaVariables): number {
  if (!expression || expression.length > 500) {
    throw new Error('Fórmula inválida ou muito longa');
  }

  try {
    const vars = {
      ...variables,
      area: (variables.width * variables.height) / 10000,
    };

    const result = limitedEvaluate(expression, vars);

    if (typeof result !== 'number' || Number.isNaN(result) || !Number.isFinite(result)) {
      throw new Error('Resultado inválido');
    }

    return Math.max(0, result);
  } catch (err) {
    throw new Error(`Erro na fórmula: ${(err as Error).message}`);
  }
}

export const FORMULA_VARIABLE_DOCS = [
  { name: 'width', description: 'Largura informada, em centímetros' },
  { name: 'height', description: 'Altura informada, em centímetros' },
  { name: 'thickness', description: 'Espessura informada, em milímetros' },
  { name: 'area', description: 'Área calculada automaticamente em m² (width * height / 10000)' },
  { name: 'pricePerM2', description: 'Preço base do mármore por m²' },
  { name: 'quantity', description: 'Quantidade de peças' },
];

export const DEFAULT_FORMULA_EXPRESSION = 'area * pricePerM2 * quantity';
