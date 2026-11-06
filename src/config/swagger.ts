import { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import fs from 'node:fs';
import path from 'node:path';

export function setupSwagger(app: Express): void {
  // Disponível apenas em ambiente de desenvolvimento e testes
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const filePath = path.resolve(process.cwd(), 'docs/openapi.yaml');
  if (!fs.existsSync(filePath)) {
    console.warn(`[Swagger] Arquivo de documentação não encontrado em: ${filePath}`);
    return;
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const swaggerDocument = YAML.parse(fileContent);

  const options: swaggerUi.SwaggerOptions = {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
    },
    customSiteTitle: 'SiteGaragem API Docs',
  };

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));

  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerDocument);
  });
}
