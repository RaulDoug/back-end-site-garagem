-- Extensão necessária para UUID e Hash de senhas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-------------------------------------------------
-- Tabela de loja (store)
-------------------------------------------------

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  address VARCHAR(255) NOT NULL,
  cnpj VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true
  created_at TIMESTAMPTZ DEFAULT now()
)

-------------------------------------------------
-- Enum de roles para tabela usuário 
-------------------------------------------------
CREATE TYPE users_roles_types AS ENUM ('ADMIN', 'SELLER', 'VIEWER', 'PUBLIC')

-------------------------------------------------
-- Tabela de usuário (user)
-------------------------------------------------

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  role users_roles_types DEFAULT 'SELLER',
  commission_rates DECIMAL(5, 2),
  is_active BOOLEAN DEFAULT true
  created_at TIMESTAMP DEFAULT now()
)

-------------------------------------------------
-- Tabela de marca (brands)
-------------------------------------------------

CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL
)

-------------------------------------------------
-- Tabela de opcionais (features)
-------------------------------------------------

CREATE TABLE features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL
)

-------------------------------------------------
-- Tabela de promoções (promotions)
-------------------------------------------------

CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description VARCHAR(255),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true
)

-------------------------------------------------
-- Tabela de modelo (models) - depende de brands
-------------------------------------------------

CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL
  CONSTRAINT fk_models_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
)