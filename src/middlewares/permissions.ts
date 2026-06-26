import { Request, Response, NextFunction } from 'express';
import { UserPermissions } from '../utils/permissions';

export function requirePermission(permission: keyof UserPermissions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Não autenticado' });
    if (user.role === 'MASTER') return next();
    if (!user.permissions?.[permission]) {
      return res.status(403).json({ error: 'Você não tem permissão para esta ação' });
    }
    next();
  };
}
