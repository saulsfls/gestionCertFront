export interface CmcTablaSeleccion {
  seleccionada: boolean;
  filaIndex: number;
  columnaReferenciaKey: string;
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
  nRegistros?: number;
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
  minReferencia?: string;
  maxReferencia?: string;
  nRegistrosPorCertificado?: number[];
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

export interface CmcFuenteIncertidumbre {
  clave: string;
  nombre: string;
  valor: number;
  dof: number;
  pesoPct: number;
}

export interface CmcResultado {
  estabilidad: number;
  sesgo: number;
  deriva: number;
  incertRefEstandar: number;
  estabilidadRefEstandar: number;
  repetibilidad: number;
  reproducibilidad: number;
  incertidumbreCombinada: number;
  dofEfectivos: number;
  coefExpansion: number;
  incertidumbreExpandida: number;
  fuentes: CmcFuenteIncertidumbre[];
  cmcNumero: number;
  rangoReferencia: string;
  certificados: string[];
  minReferencia?: string;
  maxReferencia?: string;
  nRegistrosPorCertificado?: number[];
}