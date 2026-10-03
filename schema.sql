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
  cnpj VARCHAR(18) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-------------------------------------------------
-- Enum de roles para tabela usuário 
-------------------------------------------------
CREATE TYPE users_roles_types AS ENUM ('ADMIN', 'VENDEDOR', 'VISUALIZADOR', 'PUBLICO');

-------------------------------------------------
-- Tabela de usuário (user)
-------------------------------------------------

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  role users_roles_types DEFAULT 'VENDEDOR',
  commission_rates DECIMAL(5, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-------------------------------------------------
-- Tabela de marca (brands)
-------------------------------------------------

CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL
);

-------------------------------------------------
-- Tabela de opcionais (features)
-------------------------------------------------

CREATE TABLE features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE
);

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
);

-------------------------------------------------
-- Tabela de modelo (models) - depende de brands
-------------------------------------------------

CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  CONSTRAINT fk_models_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

-------------------------------------------------
-- Tabela de banco de financiamento (financing_banks) - depende de store
-------------------------------------------------

CREATE TABLE financing_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  display_order INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT fk_fb_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-------------------------------------------------
-- Tabela de hero banner (hero_banner) - depende de promotion
-------------------------------------------------

CREATE TABLE hero_banner (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL,
  image_path VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  redirect_url VARCHAR(255) NOT NULL,
  duration_seconds INTEGER NOT NULL,
  display_order INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  CONSTRAINT fk_hb_promotions FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
);

-------------------------------------------------
-- Tabela de taxas bancárias (bank_rates) - depende de financing_banks
-------------------------------------------------

CREATE TABLE bank_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id UUID NOT NULL,
  months_from INTEGER NOT NULL,
  months_to INTEGER NOT NULL,
  monthly_interest_rate DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT fk_bank_rates_financing_banks FOREIGN KEY (bank_id) REFERENCES financing_banks(id) ON DELETE CASCADE
);

-------------------------------------------------
-- Enum de preferência de forma de contato para tabela leads interesse 
-------------------------------------------------
CREATE TYPE lead_preferred_channel_type AS ENUM ('WHATSAPP', 'LIGACAO', 'EMAIL');

-------------------------------------------------
-- Enum de preferência de turno do contato para tabela leads interesse 
-------------------------------------------------
CREATE TYPE lead_preferred_shift_type AS ENUM ('MANHA', 'TARDE', 'NOITE');

-------------------------------------------------
-- Tabela de lead interessado (lead_interests) - quer models
-------------------------------------------------

CREATE TABLE lead_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(255) NOT NULL,
  preferred_channel lead_preferred_channel_type DEFAULT 'WHATSAPP',
  preferred_shift lead_preferred_shift_type DEFAULT 'TARDE',
  brand_id UUID NOT NULL,
  model_id UUID NOT NULL,
  min_year INTEGER NOT NULL,
  max_year INTEGER NOT NULL,
  max_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT fk_brand_lead_interest FOREIGN KEY (brand_id) REFERENCES brands(id),
  CONSTRAINT fk_model_lead_interest FOREIGN KEY (model_id) REFERENCES models(id)
);

-------------------------------------------------
-- Enum de tipo de venda para tabela vehicle 
-------------------------------------------------
CREATE TYPE vehicle_sale_types AS ENUM ('PROPRIO', 'CONSIGNADO');

-------------------------------------------------
-- Enum de tipo de venda para tabela vehicle 
-------------------------------------------------
CREATE TYPE vehicle_transmission_types AS ENUM ('AUTOMATICO', 'MANUAL', 'AUTOMATIZADO');

-------------------------------------------------
-- Enum de categoria de veículos para tabela vehicle 
-------------------------------------------------
CREATE TYPE vehicle_category_types AS ENUM ('HATCH', 'SEDÃ', 'SUV', 'PICAPE', 'CUPE', 'CONVERSIVEL', 'PERUA', 'MINIVAN/VAN', 'ESPORTIVO');

-------------------------------------------------
-- Enum de tipos de combustível de veículos para tabela vehicle 
-------------------------------------------------
CREATE TYPE vehicle_fuel_types AS ENUM ('GASOLINA', 'ALCOOL', 'DIESEL', 'FLEX', 'ELETRICO', 'HIBRIDO');

-------------------------------------------------
-- Enum de status do anúncio do veículos para tabela vehicle 
-------------------------------------------------
CREATE TYPE vehicle_status_types AS ENUM ('ATIVO', 'RESERVADO', 'EM_NEGOCIACAO', 'VENDIDO', 'INATIVO');

-------------------------------------------------
-- Tabela de anúncio do veículo (vehicles)
-------------------------------------------------

CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  registered_by_user_id UUID NOT NULL,
  sold_by_user_id UUID,
  model_id UUID NOT NULL,
  promotion_id UUID,
  sale_type vehicle_sale_types DEFAULT 'PROPRIO',
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  sale_price DECIMAL(10, 2) NOT NULL,
  purchase_price DECIMAL(10, 2) NOT NULL,
  owner_price DECIMAL(10, 2) NOT NULL,
  store_commission_rate DECIMAL(5, 2),
  owner_name VARCHAR(255),
  owner_contact VARCHAR(15),
  fipe_price DECIMAL(10, 2),
  min_down_payment DECIMAL(10, 2),
  max_installments INTEGER,
  manufacture_year INTEGER NOT NULL,
  model_year INTEGER NOT NULL,
  mileage INTEGER NOT NULL,
  transmission vehicle_transmission_types NOT NULL,
  color VARCHAR(20) NOT NULL,
  category vehicle_category_types NOT NULL,
  horsepower INTEGER,
  fuel_type vehicle_fuel_types NOT NULL,
  steering VARCHAR(20) NOT NULL,
  doors INTEGER NOT NULL,
  full_license_plate VARCHAR(10) NOT NULL,
  plate_last_digit INTEGER NOT NULL,
  status vehicle_status_types DEFAULT 'ATIVO',
  has_scheduled_visit BOOLEAN DEFAULT false,
  reservation_expires_at TIMESTAMP,
  video_url VARCHAR(255),
  inspection_report_url VARCHAR(255),
  total_views INTEGER DEFAULT 0,
  sold_at TIMESTAMP,
  buyer_name VARCHAR(255),
  buyer_contact VARCHAR(255),
  website_lead_origin BOOLEAN,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP,
  CONSTRAINT fk_store_vehicle FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_register_user_vehicle FOREIGN KEY (registered_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_sold_user_vehicle FOREIGN KEY (sold_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_model_vehicle FOREIGN KEY (model_id) REFERENCES models(id),
  CONSTRAINT fk_promotion_vehicle FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE SET NULL
);

-------------------------------------------------
-- Tabela de foto do veículo (vehicle_photos)
-------------------------------------------------

CREATE TABLE vehicle_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  thumb_path VARCHAR(255) NOT NULL,
  full_path VARCHAR(255) NOT NULL,
  display_order INTEGER,
  is_primary BOOLEAN,
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT fk_vehicle_photo FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

-------------------------------------------------
-- Enum de status para agendamento de visitas do veículos para tabela visit_appointments 
-------------------------------------------------
CREATE TYPE visit_appointment_status_types AS ENUM ('PENDENTE', 'AGENDADO', 'REALIZADO', 'CANCELADO', 'NAO_APARECEU');

-------------------------------------------------
-- Tabela de agendametno de visitas (visit_appointments)
-------------------------------------------------

CREATE TABLE visit_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  user_id UUID,
  customer_name VARCHAR(255) NOT NULL,
  customer_contact VARCHAR(255) NOT NULL,
  preferred_channel lead_preferred_channel_type DEFAULT 'WHATSAPP',
  scheduled_at TIMESTAMP,
  status visit_appointment_status_types DEFAULT 'PENDENTE',
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT fk_vehicle_visit_appointments FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_visit_appointments FOREIGN KEY (user_id) REFERENCES users(id)
);

-------------------------------------------------
-- Enum de status para propostas de trocas da tabela trade_in_proposals 
-------------------------------------------------
CREATE TYPE trade_in_proposals_status_types AS ENUM ('PENDENTE', 'EM_AVALIACAO', 'APROVADA', 'RECUSADA', 'CANCELADA');

-------------------------------------------------
-- Tabela de proposta de troca (trade_in_proposals)
-------------------------------------------------

CREATE TABLE trade_in_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(15) NOT NULL,
  preferred_channel lead_preferred_channel_type DEFAULT 'WHATSAPP',
  preferred_shift lead_preferred_shift_type DEFAULT 'TARDE',
  vehicle_brand VARCHAR(255) NOT NULL,
  vehicle_model VARCHAR(255) NOT NULL,
  vehicle_year INTEGER NOT NULL,
  vehicle_mileage INTEGER NOT NULL,
  intended_value DECIMAL(10, 2) NOT NULL,
  notes TEXT NOT NULL,
  status trade_in_proposals_status_types DEFAULT 'PENDENTE',
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT fk_vehicle_trad_in_proposals FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

-------------------------------------------------
-- Tabela de métricas do veículo (vehicle_metrics)
-------------------------------------------------

CREATE TABLE vehicle_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  recorded_date DATE DEFAULT now(),
  views_count INTEGER DEFAULT 0,
  whatsapp_clicks_count INTEGER DEFAULT 0,
  CONSTRAINT fk_vehicle_vehicle_metrics FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

-------------------------------------------------
-- Tabela de auditoria do veículo (vehicle_audits)
-------------------------------------------------

CREATE TABLE vehicle_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  user_id UUID NOT NULL,
  changed_at TIMESTAMP DEFAULT now(),
  changed_field VARCHAR(255),
  old_value VARCHAR(255),
  new_value VARCHAR(255),
  CONSTRAINT fk_vehicle_vehicle_audits FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_vehicle_audits FOREIGN KEY  (user_id) REFERENCES users(id)
);

-------------------------------------------------
-- Tabela de associação de opcionais do veículo e a tabela de opcionais (vehicle_features)
-------------------------------------------------

CREATE TABLE vehicle_features (
  vehicle_id UUID NOT NULL,
  feature_id UUID NOT NULL,
  CONSTRAINT fk_vehicle_vf FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  CONSTRAINT fk_feature_vf FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE CASCADE,
  PRIMARY KEY (vehicle_id, feature_id)
);

CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_model_id ON vehicles(model_id);
CREATE INDEX idx_vehicles_category ON vehicles(category);
CREATE INDEX idx_vehicles_sale_price ON vehicles(sale_price);
CREATE INDEX idx_vehicles_created_at ON vehicles(created_at);