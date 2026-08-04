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
    const widthM = variables.width / 100;
    const heightM = variables.height / 100;

    const vars = {
      // includeAcabamento/includeInstalacao vêm do orçamento (1 = cliente marcou a
      // opção, 0 = não marcou) — default 1 para não quebrar fórmulas antigas/testes
      // que não passam essas variáveis.
      includeAcabamento: 1,
      includeInstalacao: 1,
      ...variables,
      area: (variables.width * variables.height) / 10000,
      // Perímetro total (4 lados), em metros lineares — usado para acabamento/frontão.
      perimeter: 2 * (widthM + heightM),
      // Perímetro de 3 lados (comprimento + as 2 laterais, excluindo o lado encostado
      // na parede), em metros lineares — usado para instalação. Assume que "width" é
      // o comprimento (lado exposto) e "height" é a profundidade/lateral.
      threeSidePerimeter: widthM + 2 * heightM,
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
  { name: 'width', description: 'Comprimento (lado exposto/frente) informado, em centímetros' },
  { name: 'height', description: 'Profundidade/lateral informada, em centímetros' },
  { name: 'thickness', description: 'Espessura informada, em milímetros' },
  { name: 'area', description: 'Área calculada automaticamente em m² (width * height / 10000)' },
  { name: 'perimeter', description: 'Perímetro total (4 lados) calculado automaticamente em metros lineares — 2 * (width + height) / 100. Use para acabamento/frontão.' },
  { name: 'threeSidePerimeter', description: 'Perímetro de 3 lados (comprimento + as 2 laterais, sem o lado encostado na parede) em metros lineares — width/100 + 2 * height/100. Use para instalação.' },
  { name: 'pricePerM2', description: 'Preço base do mármore por m²' },
  { name: 'quantity', description: 'Quantidade de peças. Já é multiplicada automaticamente pelo sistema após o cálculo — normalmente não inclua quantity na fórmula.' },
  { name: 'includeAcabamento', description: '1 se o cliente marcou a opção "acabamento/frontão" no orçamento, 0 caso contrário. Multiplique o termo de acabamento por essa variável.' },
  { name: 'includeInstalacao', description: '1 se o cliente marcou a opção "instalação" no orçamento, 0 caso contrário. Multiplique o termo de instalação por essa variável.' },
];

// Reproduz o cálculo padrão da marmoraria: material por m² + acabamento/frontão
// por metro linear (perímetro total) + instalação por metro linear (3 lados).
// Acabamento e instalação só entram se o cliente marcar a respectiva opção no
// orçamento (includeAcabamento/includeInstalacao — ver evaluateFormula).
// Cuba, frete e outros adicionais entram separadamente (extras do item / frete do orçamento).
export const DEFAULT_FORMULA_EXPRESSION =
  'area * pricePerM2 + perimeter * 110 * includeAcabamento + threeSidePerimeter * 150 * includeInstalacao';
