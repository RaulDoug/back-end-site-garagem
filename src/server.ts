import 'dotenv/config';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { ensureUploadDirs } from '#utils/storage.util.js';
import { viewTracker } from '#utils/view-tracker.util.js';
import { VehicleRepository } from '#repositories/vehicle.repository.js';

const vehicleRepository = new VehicleRepository();

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    await pool.query('SELECT NOW()');
    console.log('PostgreSQL conectado com sucesso!');
    
    await ensureUploadDirs();

    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });

    const interval = 60 * 1000;
    setInterval(async () => {
      try {
        const pending = viewTracker.drainPending();

        if (pending.size > 0) await vehicleRepository.incrementBatchViews(pending);
      } catch (error) {
        console.error(error);
      }
    }, interval).unref();
  } catch (error) {
    console.error('Erro ao conectar ao PostgreSQL:', error);
    process.exit(1);
  }
}

main();




