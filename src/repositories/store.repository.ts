import pool from '../config/database';

export interface Store {
    id: string;
    name: string;
    phone: string;
    address: string;
    cnpj: string;
    is_active: boolean;
    deleted_at: Date | null;
    created_at: Date;
}

export interface CreateStoreData {
    name: string;
    phone: string;
    address: string;
    cnpj: string;
}

export class StoreRepository {
    
}