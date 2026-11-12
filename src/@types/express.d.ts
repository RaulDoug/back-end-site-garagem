declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        tenantId: string;
        storeId: string | null;
      };
      tenantContext?: {
        tenantId: string;
        storeId: string | null;
      };
    }
  }
}

export {};
