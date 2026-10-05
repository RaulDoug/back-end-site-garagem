import { hash, compare } from 'bcrypt';

const saltRounds = 10;

export const hashPassword = async (pass: string): Promise<string> => {
  return await hash(pass, saltRounds);
};

export const comparePassword = async (purePass: string, hashPass: string): Promise<boolean> => {
  return await compare(purePass, hashPass);
};