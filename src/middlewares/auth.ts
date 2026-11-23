import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { UserPermissions } from '../utils/permissions';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'MASTER' | 'ADMIN' | 'EMPLOYEE' | 'SALESPERSON';
  permissions: UserPermissions;
}

// Cliente logado no site (conta criada pelo admin) — só pode montar orçamentos.
export interface AuthClient {
  loginId: string;
  clientId: string;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      siteClient?: AuthClient;
    }
  }
}

// O mesmo cookie/JWT serve para os dois tipos de conta: funcionários levam
// `userId` no token e clientes levam `clientLoginId`.
interface TokenPayload {
  userId?: string;
  clientLoginId?: string;
  iat?: number;
}

function readToken(req: Request): string | undefined {
  return req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
}

async function loadUser(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions as unknown as UserPermissions,
  };
}

async function loadClient(loginId: string, issuedAt?: number): Promise<AuthClient | null> {
  const login = await prisma.clientLogin.findUnique({
    where: { id: loginId },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!login) return null;
  // Senha trocada depois que o token foi emitido: a sessão antiga não vale mais.
  if (issuedAt !== undefined && issuedAt * 1000 < login.passwordChangedAt.getTime() - 1000) return null;
  return { loginId: login.id, clientId: login.client.id, email: login.email, name: login.client.name };
}

// Área administrativa: só funcionários. Token de cliente é recusado.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ error: 'Não autenticado' });

    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;
    const user = payload.userId ? await loadUser(payload.userId) : null;

    if (!user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// Site público (montar orçamento): aceita funcionário OU cliente com login.
export async function requireSiteAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ error: 'Faça login para continuar' });

    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;
    if (payload.userId) {
      const user = await loadUser(payload.userId);
      if (user) req.user = user;
    } else if (payload.clientLoginId) {
      const client = await loadClient(payload.clientLoginId, payload.iat);
      if (client) req.siteClient = client;
    }

    if (!req.user && !req.siteClient) {
      return res.status(401).json({ error: 'Faça login para continuar' });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }
}

export function requireRole(...roles: AuthUser['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}
