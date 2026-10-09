export interface CmcTablaSeleccion {
  seleccionada: boolean;
  filaIndex: number;
  columnaErrorKey: string;
  columnaIncertidumbreKey: string;
}

export interface CmcFilaDetalle {
  cc: string;
  table_id: string;
  fechaCalibracion: string;
  diasDesdeAnterior: number | null;
  error: number;
  incertidumbre: number;
  rango: string;
}

export interface CmcPayload {
  id: string;
  cmcNumero: number;
  errores: number[];
  incertidumbres: number[];
  tiempoIntermedio: number[];
  intervaloCalibracion: number;
  fechasCalibracion: string[];
  certificados: string[];
  rangoReferencia: string;
  detalle: CmcFilaDetalle[];
}

export interface CmcMultiPayload {
  cmcs: CmcPayload[];
}

export interface CmcConfiguracion {
  id: number;
  intervaloCalibracion: number;
  selecciones: Record<number, CmcTablaSeleccion>;
  payload: CmcPayload | null;
  payloadTexto: string;
}
