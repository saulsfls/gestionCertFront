export interface DerivaInput {
  /** Errores relativos de certificados, del más antiguo al más reciente. */
  errores: number[];
  /** Días entre calibraciones consecutivas, del más antiguo al más reciente. */
  tiempoIntermedio: number[];
  /** Intervalo de calibración en meses. */
  intervaloCalibracion: number;
}

export interface DerivaOutput {
  derivaIndividual: number[];
  deriva: number;
  dofDeriva: number;
}

export interface RepetibilidadInput {
  /** Matriz: filas = operadores, columnas = medidas. */
  datos: number[][];
  /** Si true, convierte a % respecto a `referencia`. */
  porcentaje?: boolean;
  /** Valor de referencia para conversión a %. Obligatorio si `porcentaje=true`. */
  referencia?: number;
}

export interface RepetibilidadOutput {
  repetibilidad: number;
  dofRepetibilidad: number;
  reproducibilidad: number;
  dofReproducibilidad: number;
}

export interface EstabilidadInput {
  errores: number[];
}

export interface EstabilidadOutput {
  estabilidad: number;
  dofEstabilidad: number;
}

export interface ReferenciaInput {
  /** Incertidumbres de certificados, del más antiguo al más reciente. */
  incertidumbres: number[];
}

export interface ReferenciaOutput {
  refIncStd: number;
  dofRefIncStd: number;
}

/** Resultado consolidado de todos los módulos. */
export interface IncertidumbreCompleta {
  deriva: DerivaOutput;
  repetibilidad: RepetibilidadOutput;
  estabilidad: EstabilidadOutput;
  referencia: ReferenciaOutput;
}
