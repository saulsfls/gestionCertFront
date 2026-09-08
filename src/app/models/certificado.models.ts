// Representa el modelo principal del Certificado según la tabla de PostgreSQL
export interface Certificado {
  id?: number; // Certificate ID
  cc?: string; // Certificate folio / number
  equipment_id: string; // Equipment ID
  name_equipment: string; // Equipment name
  date_cal?: string; // Calibration date
  date_cc?: string; // Issue date
  entity?: string; // Measured entity / purpose
  cert_type?: string; // Certificate type
  comments?: string; // General comments
  active?: boolean; // Is active
  data?: CertificadoData | Record<string, any>; // JSON data
}

// Estructura del JSON almacenado en la columna 'data'
export interface CertificadoData {
  "Result Tables"?: ResultTable[]; // Nueva clave principal en inglés
}

export interface Column {
  key: string;
  label: string;
  unit?: string;
  type: 'string' | 'number';
}

export interface ResultTable {
  title: string;
  equipment_id: string;
  parameter: string;
  calibration_equation: string;
  unit: string;
  range: string;
  comments: string;
  columns: Column[];
  rows: Record<string, any>[];
}

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  total?: number;
  message?: string;
  error?: string;
}
