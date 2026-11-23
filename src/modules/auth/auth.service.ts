import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/errorHandler';

// Sessão longa: o login fica salvo no navegador por 90 dias.
export const SESSION_DAYS = 90;
export const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

function signToken(payload: { userId: string } | { clientLoginId: string }) {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: `${SESSION_DAYS}d`,
  } as jwt.SignOptions);
}

function publicUser(user: { id: string; name: string; email: string; role: string; permissions: unknown }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
  };
}

async function findActiveUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

export function normalizeLoginEmail(email: string) {
  return email.trim().toLowerCase();
}

// Login do painel administrativo: só funcionários.
export async function login(email: string, password: string) {
  const user = await findActiveUser(email, password);
  if (!user) {
    const clientLogin = await prisma.clientLogin.findUnique({ where: { email: normalizeLoginEmail(email) } });
    if (clientLogin) {
      throw new AppError('Este login é de cliente e serve apenas para fazer orçamentos no site.', 403);
    }
    throw new AppError('Credenciais inválidas', 401);
  }

  return { token: signToken({ userId: user.id }), user: publicUser(user) };
}

export interface SiteSession {
  kind: 'user' | 'client';
  name: string;
  email: string;
  role?: string;
  clientId?: string;
}

// Login do site (orçamentos): aceita funcionário ou cliente.
export async function siteLogin(email: string, password: string): Promise<{ token: string; session: SiteSession }> {
  const user = await findActiveUser(email, password);
  if (user) {
    return {
      token: signToken({ userId: user.id }),
      session: { kind: 'user', name: user.name, email: user.email, role: user.role },
    };
  }

  const login = await prisma.clientLogin.findUnique({
    where: { email: normalizeLoginEmail(email) },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!login || !(await bcrypt.compare(password, login.passwordHash))) {
    throw new AppError('E-mail ou senha inválidos', 401);
  }

  await prisma.clientLogin.update({ where: { id: login.id }, data: { lastLoginAt: new Date() } });

  return {
    token: signToken({ clientLoginId: login.id }),
    session: { kind: 'client', name: login.client.name, email: login.email, clientId: login.client.id },
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('Usuário não encontrado', 404);
  return publicUser(user);
}
