/** Bancos que se ofrecen al crear una tarjeta (solo el nombre; nunca números de tarjeta). */
export interface BankProfile {
  id: string;
  name: string;
}

export const BANKS: BankProfile[] = [
  { id: 'banrural', name: 'Banrural' },
  { id: 'promerica', name: 'Promerica' },
  { id: 'bi', name: 'Banco Industrial' },
  { id: 'bac', name: 'BAC Credomatic' },
  { id: 'gyt', name: 'G&T Continental' },
];
