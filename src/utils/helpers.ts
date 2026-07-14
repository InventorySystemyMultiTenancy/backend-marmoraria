export function calcAreaM2(widthCm: number, heightCm: number): number {
  return (widthCm * heightCm) / 10000;
}

export async function generateSequentialNumber(
  prefix: string,
  count: number
): Promise<string> {
  const year = new Date().getFullYear();
  const seq = String(count + 1).padStart(4, '0');
  return `${prefix}-${year}-${seq}`;
}

export function paginationParams(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) added++;
  }
  return result;
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  for (const [length, expectedIndex] of [[9, 9], [10, 10]] as const) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    let digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    if (digit !== Number(cpf[expectedIndex])) return false;
  }
  return true;
}

function isValidCnpj(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base: string) => {
    const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split('').reduce((acc, digit, i) => acc + Number(digit) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstDigit = calcDigit(cnpj.slice(0, 12));
  const secondDigit = calcDigit(cnpj.slice(0, 12) + firstDigit);
  return firstDigit === Number(cnpj[12]) && secondDigit === Number(cnpj[13]);
}

export function isValidCpfCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  return digits.length === 11 ? isValidCpf(digits) : digits.length === 14 ? isValidCnpj(digits) : false;
}
