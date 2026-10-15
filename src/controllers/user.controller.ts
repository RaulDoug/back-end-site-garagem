import { CreateUserInput, LoginUserInput } from '#schemas/user.schema.js';
import type { User } from '#repositories/user.repository.js';
import UserService from '#services/user.service.js';
import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { BaseController } from './base.controller';

export default class UserController extends BaseController<User> {
  constructor(private userService = new UserService()) {
    super(userService);
  }

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: CreateUserInput = req.body;

      const newUser = await this.userService.create({ ...data });

      return res.status(201).json({
        message: 'Usuário criado com sucesso!',
        user: newUser,
      });
    } catch (error) {
      console.log(error);
      return next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: LoginUserInput = req.body;

      const userLoged = await this.userService.login(data);

      return res.status(200).json({
        message: 'Login realizado com sucesso!',
        userInfo: userLoged,
      });
    } catch (error) {
      console.log(error);
      return next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const user = await this.userService.findById(id as string);

      if (!user) return res.status(404).json({ message: 'Registro não encontrado' });

      const { password_hash, ...userWithoutPassword } = user; // eslint-disable-line

      return res.status(200).json({ userInfo: userWithoutPassword });
    } catch (error) {
      console.log(error);
      return next(error);
    }
  };
}