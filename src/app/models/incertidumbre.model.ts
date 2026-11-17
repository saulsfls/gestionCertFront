export type UncertaintyType = 'TIPO A' | 'TIPO B';
export type UncertaintyDistribution = 'NORMAL' | 'RECTANGULAR' | 'TRIANGULAR' | 'U' | 'OTRA';

export interface Uncertainty {
  id: number;
  clave: string;
  name: string;
  description: string;
  type: UncertaintyType;
  distribution: UncertaintyDistribution;
  obsolete: 0 | 1;
}

// Payload para crear (todos obligatorios salvo obsolete)
export interface CreateUncertaintyDto {
  clave: string;
  name: string;
  description: string;
  type: UncertaintyType;
  distribution: UncertaintyDistribution;
  obsolete?: 0 | 1;
}

// Payload para PATCH parcial
export type UpdateUncertaintyDto = Partial<CreateUncertaintyDto>;

// Envoltorio estándar de la API
export interface ApiResponse<T> {
  ok: boolean;
  data: T;
}

export interface ApiListResponse<T> {
  ok: boolean;
  total: number;
  data: T[];
}

export interface ApiErrorResponse {
  ok: false;
  code?: string | null;
  errno?: number | null;
  sqlState?: string | null;
  message: string;
  detail?: string;
}
