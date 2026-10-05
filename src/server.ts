import 'dotenv/config';
import app from './app';
import pool from './config/database';


const PORT = process.env.PORT || 3000;

async function main() {
  try {
    await pool.query('SELECT NOW()')
      .then(() => console.log('PostgreSQL conectado com sucesso!'))
      .catch((err) => console.error('Erro ao conectar ao PostgreSQL:', err));

    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.log(error);
  }
}

main();




