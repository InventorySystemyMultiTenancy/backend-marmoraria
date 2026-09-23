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
      // opção, 0 = não marcou). Default 0 (NÃO incluir) se o chamador esquecer de
      // passar essas variáveis — assim um caller que esqueça o campo nunca cobra
      // um serviço em silêncio; na pior hipótese, o serviço fica de fora.
      includeAcabamento: 0,
      includeInstalacao: 0,
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

export interface FormulaBreakdown {
  unitPrice: number;
  materialValue: number;
  acabamentoValue: number;
  instalacaoValue: number;
}

// Calcula o preço e detalha quanto do valor é material x acabamento/frontão x
// instalação — comparando o resultado da fórmula com cada termo opcional
// ligado/desligado. Funciona mesmo com fórmulas customizadas, desde que sigam a
// convenção de multiplicar o termo pela variável includeAcabamento/
// includeInstalacao. materialValue absorve o restante, então os três valores
// sempre somam exatamente o unitPrice, mesmo se a fórmula não for perfeitamente
// aditiva. Usada tanto ao salvar o orçamento quanto na prévia (preview público),
// pra garantir que o detalhamento mostrado ao cliente/admin bate com o valor real.
export function evaluateFormulaBreakdown(
  expression: string,
  baseVars: { width: number; height: number; thickness: number; pricePerM2: number; quantity: number },
  includeAcabamento: boolean,
  includeInstalacao: boolean
): FormulaBreakdown {
  const unitPrice = evaluateFormula(expression, {
    ...baseVars,
    includeAcabamento: includeAcabamento ? 1 : 0,
    includeInstalacao: includeInstalacao ? 1 : 0,
  });
  const baseOnly = evaluateFormula(expression, { ...baseVars, includeAcabamento: 0, includeInstalacao: 0 });
  const acabamentoValue = includeAcabamento
    ? Math.max(0, evaluateFormula(expression, { ...baseVars, includeAcabamento: 1, includeInstalacao: 0 }) - baseOnly)
    : 0;
  const instalacaoValue = includeInstalacao
    ? Math.max(0, evaluateFormula(expression, { ...baseVars, includeAcabamento: 0, includeInstalacao: 1 }) - baseOnly)
    : 0;
  const materialValue = Math.max(0, unitPrice - acabamentoValue - instalacaoValue);

  return { unitPrice, materialValue, acabamentoValue, instalacaoValue };
}

export const FORMULA_VARIABLE_DOCS = [
  { name: 'width', description: 'Comprimento (lado exposto/frente) informado, em centímetros' },
  { name: 'height', description: 'Profundidade/lateral informada, em centímetros' },
  { name: 'thickness', description: 'Espessura informada, em milímetros' },
  { name: 'area', description: 'Área calculada automaticamente em m² (width * height / 10000)' },
  { name: 'perimeter', description: 'Perímetro total (4 lados) calculado automaticamente em metros lineares — 2 * (width + height) / 100. Use para acabamento/frontão (metro linear = 20% do m²: perimeter * pricePerM2 * 0.2).' },
  { name: 'threeSidePerimeter', description: 'Perímetro de 3 lados (comprimento + as 2 laterais, sem o lado encostado na parede) em metros lineares — width/100 + 2 * height/100. Use para instalação.' },
  { name: 'pricePerM2', description: 'Preço base do mármore por m²' },
  { name: 'quantity', description: 'Quantidade de peças. Já é multiplicada automaticamente pelo sistema após o cálculo — normalmente não inclua quantity na fórmula.' },
  { name: 'includeAcabamento', description: '1 se o cliente marcou a opção "acabamento/frontão" no orçamento, 0 caso contrário. Multiplique o termo de acabamento por essa variável.' },
  { name: 'includeInstalacao', description: '1 se o cliente marcou a opção "instalação" no orçamento, 0 caso contrário. Multiplique o termo de instalação por essa variável.' },
];

// Reproduz o cálculo padrão da marmoraria: material por m² + acabamento/frontão
// por metro linear (perímetro total) + instalação por metro linear (3 lados).
// O metro linear de acabamento/frontão é sempre 20% do preço do m² do material
// (ex: Preto São Gabriel a R$ 750/m² → R$ 150/ml).
// Acabamento e instalação só entram se o cliente marcar a respectiva opção no
// orçamento (includeAcabamento/includeInstalacao — ver evaluateFormula).
// Cuba, frete e outros adicionais entram separadamente (extras do item / frete do orçamento).
export const DEFAULT_FORMULA_EXPRESSION =
  'area * pricePerM2 + perimeter * pricePerM2 * 0.2 * includeAcabamento + threeSidePerimeter * 150 * includeInstalacao';

// Fórmula padrão antiga, com acabamento fixo em R$ 110/ml (errado — deveria ser
// 20% do m²). Se ainda for a fórmula ativa, é substituída automaticamente pela
// nova no startup (ver upgradeLegacyDefaultFormula). Fórmulas customizadas pelo
// admin em /admin/formula não são tocadas.
export const LEGACY_DEFAULT_FORMULA_EXPRESSIONS = [
  'area * pricePerM2 + perimeter * 110 * includeAcabamento + threeSidePerimeter * 150 * includeInstalacao',
];
