import express, { Request, Response } from 'express';
import cors from 'cors';
import userRoutes from '#routes/user.routes.js';
import storeRoutes from '#routes/store.routes.js';
import { errorHandler } from '#middlewares/error.middleware.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});


app.use('/api/user', userRoutes);
app.use('/api/store', storeRoutes);

app.use(errorHandler);

export default app;