export interface CmcData {
  id?: number; //ID del calculo
  id_equipment: string; //ID del equipo
  created_at?: string; //Fecha de creacion
  id_user?: string; //Usuario que crea y calcula el CMC
  value_ref_min: string; //Valor de referencia maximo
  value_ref_max: string; //Valor de referencia minimo
  interval_value: string; //intevalo del cmc
  cert_associate: string; //Certificados asociados
  active?: number | boolean; //Certificado actual o obsoleto

  u_combined: number; //incertidumbre combinada
  degrees_freedom: number; //Grados de libertad
  coefficient_expansion: number; //Coeficiente de expansion
  u_expanded: number; //incertidumbre expandida

  stability: number; //estabilidad
  bias: number; //Sesgo
  drift: number; //Deriba
  u_reference: number; //incertidumbre de referencia
  s_reference: number; //Estabilidad de referencia
  repeatability: number; //Repetibilidad
  reproducibility: number; //Reproducibilidad
}


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

