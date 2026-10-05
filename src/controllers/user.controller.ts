import { CreateUserInput, LoginUserInput } from '#schemas/user.schema.js';
import UserService from '#services/user.service.js';
import { Request, Response } from 'express';
import { ZodError } from 'zod';

export default class UserController {
  constructor(private userService = new UserService()) { }

  register = async (req: Request, res: Response) => {
    try {
      const data: CreateUserInput = req.body;

      const newUser = await this.userService.create({ ...data });

      return res.status(201).json({
        message: 'Usuário criado com sucesso!',
        user: newUser,
      });
    } catch (error) {
      console.log(error);

      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.message });
      }

      if (error instanceof Error && error.message === 'E-mail já cadastrado') {
        return res.status(409).json({ message: error.message });
      }

      return res.status(500).json({ message: 'Erro interno do servidor' });
    }
  };

  login = async (req: Request, res: Response) => {
    try {
      const data: LoginUserInput = req.body;

      const userLoged = await this.userService.login(data);

      return res.status(200).json({
        message: 'Login realizado com sucesso!',
        userInfo: userLoged,
      });
    } catch (error) {
      console.log(error);

      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.message });
      }

      if (error instanceof Error && error.message === 'Credenciais inválidas') {
        return res.status(401).json({ message: error.message });
      }

      return res.status(500).json({ message: 'Erro interno do servidor' });
    }
  };

  findById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const user = await this.userService.findById(id as string);

      return res.status(200).json({ userInfo: user });
    } catch (error) {
      console.log(error);

      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.message });
      }

      if (error instanceof Error && error.message === 'Credenciais inválidas') {
        return res.status(401).json({ message: error.message });
      }

      return res.status(500).json({ message: 'Erro interno do servidor' });
    }
  };
}