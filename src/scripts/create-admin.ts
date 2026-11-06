/**
 * ============================================================================
 * SCRIPT DE SEED: CRIAÇÃO DE USUÁRIO ADMINISTRADOR (ADMIN)
 * ============================================================================
 * 
 * Este script cadastra diretamente um usuário com perfil ADMIN no banco de dados,
 * permitindo o primeiro acesso sem depender de rotas protegidas por autenticação.
 * 
 * ----------------------------------------------------------------------------
 * 1. ORDEM DE PRECEDÊNCIA DOS DADOS (Maior para menor prioridade):
 * ----------------------------------------------------------------------------
 *   1º - Tags / Flags via linha de comando (--email, -e, etc.)
 *   2º - Argumentos Posicionais (na ordem: Nome Email Senha Telefone)
 *   3º - Variáveis de Ambiente (.env ou inline: ADMIN_EMAIL, ADMIN_PASSWORD...)
 *   4º - Valores Padrão de Desenvolvimento
 * 
 * ----------------------------------------------------------------------------
 * 2. TAGS / FLAGS SUPORTADAS:
 * ----------------------------------------------------------------------------
 *   --name,     -n   Nome completo (mínimo 2 caracteres)
 *   --email,    -e   E-mail válido e único
 *   --password, -p   Senha (mínimo 8 dígitos: maiúscula, minúscula, número e caractere especial)
 *   --phone,    -t   Telefone com DDD (ex: 11999999999 ou "(11) 99999-9999")
 *   --help,     -h   Exibe este guia de ajuda no terminal
 * 
 * ----------------------------------------------------------------------------
 * 3. EXEMPLOS DE COMANDOS:
 * ----------------------------------------------------------------------------
 * 
 * [Exemplo 1: Uso Padrão (usa credenciais default)]
 *   npx tsx --conditions development src/scripts/create-admin.ts
 * 
 * [Exemplo 2: Usando Tags / Flags Nomeadas (Recomendado)]
 *   npx tsx --conditions development src/scripts/create-admin.ts --name="Carlos Admin" --email="carlos@garagem.com" --password="Admin@Secret123" --phone="11988887777"
 * 
 * [Exemplo 3: Usando Abreviações de Tags]
 *   npx tsx --conditions development src/scripts/create-admin.ts -n "Carlos Admin" -e "carlos@garagem.com" -p "Admin@Secret123" -t "11988887777"
 * 
 * [Exemplo 4: Usando Argumentos Posicionais (Ordem: Nome Email Senha Telefone)]
 *   npx tsx --conditions development src/scripts/create-admin.ts "Carlos Admin" "carlos@garagem.com" "Admin@Secret123" "11988887777"
 * 
 * [Exemplo 5: Usando Variáveis de Ambiente]
 *   ADMIN_EMAIL="admin2@garagem.com" ADMIN_PASSWORD="Admin@Secret123" npx tsx --conditions development src/scripts/create-admin.ts
 * 
 * ============================================================================
 */

import 'dotenv/config';
import { parseArgs } from 'node:util';
import pool from '../config/database.js';
import UserService from '../services/user.service.js';
import { createUserSchema } from '../schemas/user.schema.js';

function printHelp() {
  console.log(`
Uso do Script:
  npx tsx --conditions development src/scripts/create-admin.ts [opções]

Tags / Opções Disponíveis:
  -n, --name      Nome do usuário (Padrão: Administrador)
  -e, --email     E-mail de acesso (Padrão: admin@garagem.com)
  -p, --password  Senha forte (Padrão: Admin@123456)
  -t, --phone     Telefone com DDD (Padrão: 11999999999)
  -h, --help      Exibe esta mensagem de ajuda

Ordem dos Argumentos Posicionais:
  1. Nome | 2. E-mail | 3. Senha | 4. Telefone
  `);
}

async function createAdmin() {
  // Extração de parâmetros via linha de comando
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      name: { type: 'string', short: 'n' },
      email: { type: 'string', short: 'e' },
      password: { type: 'string', short: 'p' },
      phone: { type: 'string', short: 't' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help) {
    printHelp();
    await pool.end();
    return;
  }

  // Resolução dos dados respeitando a ordem de precedência:
  // 1. Tag (--email) -> 2. Posicional -> 3. Variável de Ambiente -> 4. Valor Padrão
  const adminData = {
    name: values.name || positionals[0] || process.env.ADMIN_NAME || 'Administrador',
    email: values.email || positionals[1] || process.env.ADMIN_EMAIL || 'admin@garagem.com',
    password: values.password || positionals[2] || process.env.ADMIN_PASSWORD || 'Admin@123456',
    phone: values.phone || positionals[3] || process.env.ADMIN_PHONE || '11999999999',
    role: 'ADMIN' as const,
  };

  try {
    // 1. Validação estrutural com o schema Zod do sistema
    const validatedData = createUserSchema.shape.body.parse(adminData);

    // 2. Execução da criação através do UserService (valida duplicidade e gera hash da senha)
    const userService = new UserService();
    const createdAdmin = await userService.create(validatedData);

    console.log('✅ Usuário ADMIN criado com sucesso!');
    console.log(`🆔 ID: ${createdAdmin.id}`);
    console.log(`👤 Nome: ${createdAdmin.name}`);
    console.log(`📧 E-mail: ${createdAdmin.email}`);
    console.log(`📞 Telefone: ${createdAdmin.phone}`);
    console.log(`👑 Perfil: ${createdAdmin.role}`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`❌ Erro ao criar administrador: ${error.message}`);
    } else {
      console.error('❌ Erro inesperado ao criar administrador:', error);
    }
    process.exitCode = 1;
  } finally {
    // 3. Encerramento obrigatório da conexão para liberar o terminal
    await pool.end();
  }
}

createAdmin();
