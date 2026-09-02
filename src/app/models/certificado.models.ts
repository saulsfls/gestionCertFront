// Representa el modelo principal del Certificado según la tabla de PostgreSQL
export interface Certificado {
  id?: number;//id del certificado
  cc?: string;//folio del certificado
  equipment_id: string;//id del equipo al que esta asociado el certificado
  name_equipment: string;//nombre del equipo
  date_cal?: string;//Fecha de calibracion
  date_cc?: string;//Fecha de emision del certificado
  entity?: string;//Que se mide en el certificado, para que se calibro
  cert_type?: string;//Tipo de certificado , ya sea certificado o datos del fabricante
  comments?: string;//Comentarios de la certificacion
  active?: boolean;//El certificado esta vigente
  data?: CertificadoData | Record<string, any>;// informacion en formato de tablas JSON
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
  equipment_id: string;
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
