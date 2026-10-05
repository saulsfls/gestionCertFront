// Representa el modelo principal del Certificado según la tabla de PostgreSQL
//Se va a modificar la estructura del modelo para agregar campos faltantes
export interface Certificado {
  id?: number; // Certificate ID
  cc?: string; // Certificate folio / number
  equipment_id: string; // Equipment ID
  name_equipment: string; // Equipment name
  date_cal?: string; // Calibration date
  date_cc?: string; // Issue date
  calibration_interval?: number; // Intervalo de calibracion en meses
  resolution?: number; //Resolucion del instrumento
  entity?: string; // Measured entity / purpose
  cert_type?: string; // Certificate type
  comments?: string; // General comments
  active?: boolean; // Is active
  data?: CertificadoData | Record<string, any>; // JSON data
}
//Estructura de la tabla, Por cada uno de las tablas de resultados se presenta esta estructura
export interface ResultTable {
  title: string; //Titulo de la tabla
  equipment_id: string; //Id del equipo
  cc_id: string; //Id del certificado asociado a la tabla
  cmc: string //CMC
  parameter: string; //Mesureament de la tabla
  calibration_equation: string; //Ecuacion de calibracion
  unit: string; //Unidad en la que se esta midiendo la tabla
  range: string; //Rango de la medicion
  comments: string; //Comentarios de la tabla
  columns: Column[]; //Columnas
  rows: Record<string, any>[]; //Filas
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


export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  total?: number;
  message?: string;
  error?: string;
}
