import { CreateUserInput, LoginUserInput, UpdateUserBody } from '#schemas/user.schema.js';
import UserService from '#services/user.service.js';
import { parseFilters } from '#utils/parse-filter.util.js';
import { Request, Response } from 'express';

export default class UserController {
  constructor(private userService = new UserService()) { }

  register = async (req: Request, res: Response) => {
    const data: CreateUserInput = req.body;

    const newUser = await this.userService.create({ ...data });

    return res.status(201).json({
      message: 'Usuário criado com sucesso!',
      user: newUser,
    });
  };

  login = async (req: Request, res: Response) => {
    const data: LoginUserInput = req.body;

    const userLoged = await this.userService.login(data);

    return res.status(200).json({
      message: 'Login realizado com sucesso!',
      userInfo: userLoged,
    });
  };

  findById = async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await this.userService.findById(id as string);

    return res.status(200).json({ userInfo: user });
  };

  find = async (req: Request, res: Response) => {
    const filters = parseFilters(req.query);

    const users = await this.userService.find(filters);

    return res.status(200).json({ users });
  };

  update = async (req: Request, res: Response) => {
    const { id } = req.params;
    const data: UpdateUserBody = req.body;

    const updatedUser = await this.userService.update(id as string, data);

    return res.status(200).json({
      message: 'Usuário atualizado com sucesso!',
      userInfo: updatedUser,
    });
  };

  delete = async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user?.id;

    if (userId === id) {
      return res.status(400).json({ message: 'Não é possível deletar o próprio usuário.' });
    }

    const deletedUser = await this.userService.delete(id as string);

    return res.status(200).json({
      message: 'Usuário deletado com sucesso!',
      userInfo: deletedUser,
    });
  };
}