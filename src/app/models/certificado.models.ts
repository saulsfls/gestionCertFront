// Representa el modelo principal del Certificado según la tabla de PostgreSQL
export interface Certificado {
  id?: number;
  cc?: string;
  equipment_id: string;
  name_equipment: string;
  date_cal?: string;
  date_cc?: string;
  mesureament?: string;
  comments?: string;
  active?: boolean;
  data?: CertificadoData | Record<string, any>;
}

// Estructura del JSON almacenado dentro de la columna 'data' (JSONB)
export interface CertificadoData {
  "Tablas de resultados"?: TablaResultado[];
  tablas_resultados?: TablaResultado[]; // Alias para compatibilidad
  magnitud?: {
    mesurando?: string;
    unidades?: string;
    rango?: string;
    estado_ajuste?: string;
  };
}

export interface Columna {
  key: string;
  label: string;
  unit?: string;
  type: 'string' | 'number';
}

export interface TablaResultado {
  titulo: string;
  mesurando: string;
  ecuation_calibration: string;
  unit: string;
  range: string,
  columnas: Columna[];
  filas: Record<string, any>[];
}

// Respuesta estándar de la API Express
export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  total?: number;
  message?: string;
  error?: string;
}
