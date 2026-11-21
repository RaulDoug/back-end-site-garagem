import { CreateUserInput, LoginUserInput, UpdateUserBody } from '#schemas/user.schema.js';
import UserService from '#services/user.service.js';
import { parseFilters } from '#utils/parse-filter.util.js';
import { Request, Response } from 'express';

export default class UserController {
  constructor(private userService = new UserService()) {}

  register = async (req: Request, res: Response) => {
    const data: CreateUserInput = req.body;
    const tenantId = req.user!.tenantId;

    const newUser = await this.userService.create({ ...data }, tenantId);

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
    const tenantId = req.user!.tenantId;

    const user = await this.userService.findById(id as string, tenantId);

    return res.status(200).json({ userInfo: user });
  };

  find = async (req: Request, res: Response) => {
    const filters = parseFilters(req.query);
    const tenantId = req.user!.tenantId;

    const users = await this.userService.find(filters, tenantId);

    return res.status(200).json({ users });
  };

  update = async (req: Request, res: Response) => {
    const { id } = req.params;
    const data: UpdateUserBody = req.body;
    const tenantId = req.user!.tenantId;

    const updatedUser = await this.userService.update(id as string, data, tenantId);

    return res.status(200).json({
      message: 'Usuário atualizado com sucesso!',
      userInfo: updatedUser,
    });
  };

  delete = async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user?.id;
    const tenantId = req.user!.tenantId;

    if (userId && userId.toLowerCase() === (id as string).toLowerCase()) {
      return res.status(400).json({ message: 'Não é possível deletar o próprio usuário.' });
    }

    const deletedUser = await this.userService.delete(id as string, tenantId);

    return res.status(200).json({
      message: 'Usuário deletado com sucesso!',
      userInfo: deletedUser,
    });
  };
}
