import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ADMIN_PERMISSIONS, SALESPERSON_PERMISSIONS, DEFAULT_PERMISSIONS } from '../src/utils/permissions';
import { DEFAULT_FORMULA_EXPRESSION, FORMULA_VARIABLE_DOCS } from '../src/utils/formulaEngine';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const companyData = {
    name: 'Marmoraria Pedras Pedroza',
    cnpj: '09.247.499/0001-00',
    phone: '(11) 2254-0986',
    whatsapp: '5511981221189',
    email: 'contato1@pedraspedroza.com.br',
    address: 'Avenida Itaquera, 3105 - Jardim Maringá, São Paulo - SP',
  };
  const company = await prisma.company.upsert({
    where: { id: 'company-seed' },
    update: companyData,
    create: { id: 'company-seed', ...companyData },
  });

  const masterPasswordHash = await bcrypt.hash('master123', 10);
  const master = await prisma.user.upsert({
    where: { email: 'master@pedraspedroza.com.br' },
    update: {},
    create: {
      name: 'Administrador Master',
      email: 'master@pedraspedroza.com.br',
      passwordHash: masterPasswordHash,
      role: 'MASTER',
      permissions: {},
    },
  });

  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@pedraspedroza.com.br' },
    update: {},
    create: {
      name: 'Administrador Geral',
      email: 'admin@pedraspedroza.com.br',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      permissions: ADMIN_PERMISSIONS,
    },
  });

  const sellerPasswordHash = await bcrypt.hash('vendas123', 10);
  await prisma.user.upsert({
    where: { email: 'vendas@pedraspedroza.com.br' },
    update: {},
    create: {
      name: 'Vendedor Exemplo',
      email: 'vendas@pedraspedroza.com.br',
      passwordHash: sellerPasswordHash,
      role: 'SALESPERSON',
      permissions: SALESPERSON_PERMISSIONS,
    },
  });

  const employeePasswordHash = await bcrypt.hash('func123', 10);
  await prisma.user.upsert({
    where: { email: 'funcionario@pedraspedroza.com.br' },
    update: {},
    create: {
      name: 'Funcionário de Produção',
      email: 'funcionario@pedraspedroza.com.br',
      passwordHash: employeePasswordHash,
      role: 'EMPLOYEE',
      permissions: { ...DEFAULT_PERMISSIONS, orders_view: true, orders_update_status: true, stock_view: true },
    },
  });

  await prisma.formulaConfig.upsert({
    where: { id: 'formula-seed' },
    update: {},
    create: {
      id: 'formula-seed',
      expression: DEFAULT_FORMULA_EXPRESSION,
      variables: FORMULA_VARIABLE_DOCS,
      description: 'Fórmula padrão: área (m²) x preço por m² x quantidade',
      isActive: true,
    },
  });

  const marbles = await Promise.all(
    [
      {
        name: 'Carrara Branco',
        description: 'Mármore italiano clássico, veios cinza suaves em fundo branco.',
        origin: 'Itália',
        color: 'Branco',
        type: 'MARBLE' as const,
        pricePerM2: 890,
        thickness: 20,
      },
      {
        name: 'Preto São Gabriel',
        description: 'Granito preto intenso, ideal para bancadas de cozinha.',
        origin: 'Brasil - ES',
        color: 'Preto',
        type: 'GRANITE' as const,
        pricePerM2: 650,
        thickness: 20,
      },
      {
        name: 'Travertino Romano',
        description: 'Textura porosa e tons amarelados, clássico em fachadas.',
        origin: 'Itália',
        color: 'Bege',
        type: 'TRAVERTINE' as const,
        pricePerM2: null,
        thickness: 20,
      },
      {
        name: 'Quartzito Taj Mahal',
        description: 'Aparência de mármore com resistência de quartzito.',
        origin: 'Brasil - MG',
        color: 'Branco/Dourado',
        type: 'QUARTZITE' as const,
        pricePerM2: 1450,
        thickness: 20,
      },
      {
        name: 'Granito Verde Ubatuba',
        description: 'Tons esverdeados escuros com brilho mineral.',
        origin: 'Brasil - ES',
        color: 'Verde',
        type: 'GRANITE' as const,
        pricePerM2: 550,
        thickness: 20,
      },
    ].map(async (data) => {
      const existing = await prisma.marble.findFirst({ where: { name: data.name } });
      return existing
        ? prisma.marble.update({ where: { id: existing.id }, data })
        : prisma.marble.create({ data: { ...data, imageUrls: [] } });
    })
  );

  await Promise.all(
    marbles.map(async (marble, idx) => {
      const existingStock = await prisma.stockItem.findFirst({ where: { marbleId: marble.id } });
      if (existingStock) return existingStock;
      return prisma.stockItem.create({
        data: {
          marbleId: marble.id,
          slabNumber: `LOTE-${idx + 1}`,
          widthCm: 300,
          heightCm: 180,
          thicknessMm: 20,
          areaM2: (300 * 180) / 10000,
          costPrice: (marble.pricePerM2 ?? 400) * 0.55 * 5.4,
          location: 'Galpão A - Setor 1',
          status: 'AVAILABLE',
        },
      });
    })
  );

  const demoQuoteNumber = 'ORC-' + new Date().getFullYear() + '-0001';
  const existingDemoQuote = await prisma.quote.findUnique({ where: { quoteNumber: demoQuoteNumber } });

  if (!existingDemoQuote) {
    const client = await prisma.client.create({
      data: {
        name: 'João da Silva',
        email: 'joao.silva@example.com',
        phone: '(11) 99999-1234',
        cpfCnpj: '123.456.789-00',
        city: 'São Paulo',
        state: 'SP',
      },
    });

    const quote = await prisma.quote.create({
      data: {
        quoteNumber: demoQuoteNumber,
        clientId: client.id,
        createdById: master.id,
        subtotal: 1602,
        total: 1602,
        status: 'APPROVED',
        source: 'ADMIN',
        items: {
          create: [
            {
              marbleId: marbles[0].id,
              description: 'Bancada de cozinha',
              widthCm: 300,
              heightCm: 60,
              thicknessMm: 20,
              quantity: 1,
              areaM2: 1.8,
              unitPrice: 890,
              totalPrice: 1602,
              extras: [],
            },
          ],
        },
      },
    });

    await prisma.order.create({
      data: {
        orderNumber: 'PED-' + new Date().getFullYear() + '-0001',
        quoteId: quote.id,
        status: 'IN_CUTTING',
        startDate: new Date(),
        estimatedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.financialEntry.createMany({
      data: [
        {
          type: 'INCOME',
          category: 'Venda',
          description: 'Recebimento de sinal - ORC-0001',
          amount: 800,
          date: new Date(),
        },
        {
          type: 'EXPENSE',
          category: 'Material',
          description: 'Compra de chapas de mármore',
          amount: 4500,
          date: new Date(),
        },
        {
          type: 'EXPENSE',
          category: 'Mão de obra',
          description: 'Pagamento equipe de corte',
          amount: 1200,
          date: new Date(),
        },
      ],
    });
  }

  console.log('Seed concluído!');
  console.log('---');
  console.log('Login MASTER: master@pedraspedroza.com.br / master123');
  console.log('Login ADMIN: admin@pedraspedroza.com.br / admin123');
  console.log('Login VENDEDOR: vendas@pedraspedroza.com.br / vendas123');
  console.log('Login FUNCIONÁRIO: funcionario@pedraspedroza.com.br / func123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
