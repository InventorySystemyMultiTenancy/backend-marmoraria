import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { paginationParams } from '../../utils/helpers';
import { AppError } from '../../middlewares/errorHandler';
import { normalizeLoginEmail } from '../auth/auth.service';

// Só o que o admin precisa ver do acesso do cliente — nunca o hash da senha.
const loginSelect = { select: { email: true, lastLoginAt: true, createdAt: true } } as const;

const clientLoginSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido'),
  // Ao editar um acesso existente a senha pode ficar em branco (mantém a atual).
  password: z.string().min(6, 'A senha precisa ter ao menos 6 caracteres').optional().or(z.literal('')),
});

const clientSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  cpfCnpj: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  notes: z.string().optional(),
});

export async function list(req: Request, res: Response) {
  const { page, limit, skip } = paginationParams(req.query as Record<string, unknown>);
  const search = (req.query.search as string) || '';

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [clients, total] = await Promise.all([
    prisma.client.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { login: loginSelect } }),
    prisma.client.count({ where }),
  ]);

  res.json({ clients, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function getOne(req: Request, res: Response) {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { quotes: { orderBy: { createdAt: 'desc' }, take: 10 }, login: loginSelect },
  });
  if (!client) throw new AppError('Cliente não encontrado', 404);
  res.json({ client });
}

export async function create(req: Request, res: Response) {
  const data = clientSchema.parse(req.body);
  const client = await prisma.client.create({ data: { ...data, email: data.email || undefined } });
  res.status(201).json({ client });
}

export async function update(req: Request, res: Response) {
  const data = clientSchema.partial().parse(req.body);
  const client = await prisma.client.update({
    where: { id: req.params.id },
    data: { ...data, email: data.email || undefined },
  });
  res.json({ client });
}

export async function remove(req: Request, res: Response) {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

// Cria ou atualiza o login do cliente no site (só serve para montar orçamentos).
export async function setLogin(req: Request, res: Response) {
  const data = clientLoginSchema.parse(req.body);
  const email = normalizeLoginEmail(data.email);
  const clientId = req.params.id;

  const client = await prisma.client.findUnique({ where: { id: clientId }, include: { login: true } });
  if (!client) throw new AppError('Cliente não encontrado', 404);
  if (!client.login && !data.password) throw new AppError('Informe uma senha para o acesso do cliente', 400);

  const [userWithEmail, otherLogin] = await Promise.all([
    prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } }),
    prisma.clientLogin.findUnique({ where: { email } }),
  ]);
  if (userWithEmail) throw new AppError('Este e-mail já é usado por um funcionário', 409);
  if (otherLogin && otherLogin.clientId !== clientId) {
    throw new AppError('Este e-mail já é usado pelo acesso de outro cliente', 409);
  }

  const passwordData = data.password
    ? { passwordHash: await bcrypt.hash(data.password, 10), passwordChangedAt: new Date() }
    : {};

  const login = client.login
    ? await prisma.clientLogin.update({ where: { clientId }, data: { email, ...passwordData }, ...loginSelect })
    : await prisma.clientLogin.create({
        data: { clientId, email, passwordHash: passwordData.passwordHash!, passwordChangedAt: new Date() },
        ...loginSelect,
      });

  res.json({ login });
}

// Remove o acesso: o cliente deixa de conseguir entrar (sessões abertas caem).
export async function removeLogin(req: Request, res: Response) {
  await prisma.clientLogin.deleteMany({ where: { clientId: req.params.id } });
  res.status(204).send();
}
