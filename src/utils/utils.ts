import { AddressInput } from '#schemas/store.schema.js';

export const buildAddress = (address: AddressInput): string => {
  return `${address.street}, ${address.number} - ${address.neighborhood}, ${address.city}/${address.state}`;
};