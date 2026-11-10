import 'dotenv/config';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { ensureUploadDirs } from '#utils/storage.util.js';

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    await pool.query('SELECT NOW()');
    console.log('PostgreSQL conectado com sucesso!');
    
    await ensureUploadDirs();

    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Erro ao conectar ao PostgreSQL:', error);
    process.exit(1);
  }
}

main();




