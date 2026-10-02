import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import pool from './config/database';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

pool.query('SELECT NOW()')
  .then(() => console.log('PostgreSQL conectado com sucesso!'))
  .catch((err) => console.error('Erro ao conectar ao PostgreSQL:', err));

export { app };