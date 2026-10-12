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


export interface CmcFuenteIncertidumbre {
  clave: string;          // 'estabilidad', 'sesgo', ...
  nombre: string;         // 'Estabilidad', 'Sesgo', ...
  valor: number;          // incertidumbre estándar
  dof: number;            // grados de libertad
  pesoPct: number;        // % de contribución a u_c^2
}

export interface CmcResultado {
  // Intermedios
  estabilidad: number;
  sesgo: number;
  deriva: number;
  incertRefEstandar: number;         // incert.est.ref / 2
  estabilidadRefEstandar: number;
  repetibilidad: number;
  reproducibilidad: number;
  // Combinada / expandida
  incertidumbreCombinada: number;
  dofEfectivos: number;
  coefExpansion: number;
  incertidumbreExpandida: number;
  // Detalle
  fuentes: CmcFuenteIncertidumbre[];
  // Metadatos
  cmcNumero: number;
  rangoReferencia: string;
  certificados: string[];
}
