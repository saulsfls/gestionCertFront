
// Modelos del recurso data_sheet
// ------------------------------------------------------------
// Solo lo que viaja a la BD y lo necesario para el control.
// La forma interna de `data` la define y valida el COMPONENTE.


// ---------- Respuesta genérica del backend ----------

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  total?: number;
  message?: string;
  detail?: string;
  code?: string;
  detalles?: string[];
  u_id?: number;
  u_clave?: string;
}


// Entidad principal (tal como la devuelve el backend)


export interface DataSheet {
  id: number;
  equipment_id: string;
  pt: string;
  /** JSON genérico. Puede venir como objeto o string según el backend. */
  data: Record<string, unknown> | string;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}


// Payloads de escritura
// ------------------------------------------------------------
// `created_by`, `updated_by` y `actor_id` los inyecta el SERVICIO
// desde AuthService. Por eso NO están en estos tipos.
// `data` viene ya parseado desde el COMPONENTE.


export interface DataSheetCreate {
  equipment_id: string;
  pt: string;
  data: Record<string, unknown>;
}

export interface DataSheetUpdate {
  equipment_id?: string;
  pt?: string;
  data?: Record<string, unknown>;
}


// Vínculos cal_data_sheet


export interface VincularPayload {
  calc_id: number;
  u_id: number;
  uncertainty?: number | null;
  // calculated_by lo inyecta el servicio
}

export interface VinculoCalDataSheet {
  calc_id: number;
  data_sheet_id: number;
  u_id: number;
  u_clave?: string;
  u_name?: string;
  uncertainty: number | string | null;
  calculated_at: string;
  calculated_by: string | null;
  created_at: string;
}


// Consolidación / presupuesto


export interface ResultadoModular {
  equipment_id?: string;
  pt?: string;
  data_sheet_id: number;
  u_id: number;
  u_clave: string;
  u_name: string;
  porcentaje_modular: number | string;
  calc_id: number;
  calculated_at: string;
  calculated_by: string | null;
}
