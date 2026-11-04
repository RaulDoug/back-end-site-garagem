import { NextFunction, Request, Response } from 'express';

export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Acesso proibido. Permissão insuficiente.' });
    }

    return next();
  };
};

export const includeDeletedValidateRole = (req: Request, res: Response, next: NextFunction) => {
  const includeDeleted = req.query.include_deleted === 'true' ? true : false;

  if (includeDeleted && req.user?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Acesso proibido. Permissão insuficiente para incluir registros excluídos.' });
  }

  return next();
};