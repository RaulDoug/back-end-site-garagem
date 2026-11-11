/**
 * Controle de métricas de visualização de veículos anti-fraude (RN007).
 * Utiliza cache em memória com TTL de 30 minutos por combinação de vehicleId + IP + User-Agent.
 */
export class ViewTracker {
  private cache = new Map<string, number>();
  private pendingViews = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMinutes = 30) {
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  shouldIncrement(vehicleId: string, ip: string, userAgent: string): boolean {
    const key = `${vehicleId}:${ip}:${userAgent}`;
    const now = Date.now();
    const expiresAt = this.cache.get(key);

    if (expiresAt && expiresAt > now) {
      return false;
    }

    this.cache.set(key, now + this.ttlMs);

    // Limpeza oportunista quando o cache atinge tamanho considerável
    if (this.cache.size > 2000) {
      for (const [k, exp] of this.cache.entries()) {
        if (exp <= now) {
          this.cache.delete(k);
        }
      }
    }

    return true;
  }

  trackView(vehicleId: string, ip: string, userAgent: string): boolean {
    const shouldIncrement = this.shouldIncrement(vehicleId, ip, userAgent);

    if (!shouldIncrement) return false;

    let currentQuantity = this.pendingViews.get(vehicleId);

    if (!currentQuantity) {
      currentQuantity = 0;
    }

    const newQuantity = currentQuantity + 1;

    this.pendingViews.set(vehicleId, newQuantity);

    return true;
  }

  drainPending(): Map<string, number> {
    const copyMap = new Map(this.pendingViews);

    this.pendingViews.clear();

    return copyMap;
  }

  getPendingViews(vehicleId: string): number {
    return this.pendingViews.get(vehicleId) || 0;
  }

  clear(): void {
    this.cache.clear();
    this.pendingViews.clear();
  }
}

export const viewTracker = new ViewTracker(30);
