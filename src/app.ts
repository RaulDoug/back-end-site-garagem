import path from 'path';
import express, { Request, Response } from 'express';
import cors from 'cors';
import userRoutes from '#routes/user.routes.js';
import storeRoutes from '#routes/store.routes.js';
import tenantRoutes from '#routes/tenant.routes.js';
import brandRoutes from '#routes/brand.routes.js';
import featureRoutes from '#routes/feature.routes.js';
import modelRoutes from '#routes/model.routes.js';
import vehicleRoutes from '#routes/vehicle.routes.js';
import errorHandler from '#middlewares/error.middleware.js';
import { setupSwagger } from './config/swagger.js';

const app = express();

const parsedHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10);
app.set('trust proxy', Number.isNaN(parsedHops) || parsedHops < 0 ? 1 : parsedHops);

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

setupSwagger(app);

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});


app.use('/api/users', userRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/features', featureRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/vehicles', vehicleRoutes);


app.use(errorHandler);

export default app;