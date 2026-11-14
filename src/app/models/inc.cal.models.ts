/** Salida universal para todos los cálculos de incertidumbre */
export interface UncertaintyOutput {
  uncertainty: number;
  dof: number;
}

// --- Entradas y Salidas de Deriva ---
export interface DerivaInput {
  /** Errores relativos de certificados, del más antiguo al más reciente. */
  errores: number[];
  /** Días entre calibraciones consecutivas, del más antiguo al más reciente. */
  tiempoIntermedio: number[];
  /** Intervalo de calibración en meses. */
  intervaloCalibracion: number;
}
export type DerivaOutput = UncertaintyOutput;

// --- Entradas y Salidas de Repetibilidad ---
export interface RepetibilidadInput {
  /** Matriz: filas = operadores, columnas = medidas. */
  datos: number[][];
  /** Si true, convierte a % respecto a `referencia`. */
  porcentaje: boolean;
  /** Valor de referencia para conversión a %. Obligatorio si `porcentaje=true`. */
  referencia: number;
}
export type RepetibilidadOutput = UncertaintyOutput;

// --- Entradas y Salidas de Reproducibilidad ---
export interface ReproducibilidadInput {
  datos: number[][];
  porcentaje: boolean;
  referencia: number;
}
export type ReproducibilidadOutput = UncertaintyOutput;

// --- Entradas y Salidas de Estabilidad ---
export interface EstabilidadInput {
  errores: number[];
}
export type EstabilidadOutput = UncertaintyOutput;

// --- Entradas y Salidas de Referencia / Patrón ---
export interface ReferenciaInput {
  /** Incertidumbres de certificados, del más antiguo al más reciente. */
  incertidumbres: number[];
}
export type ReferenciaOutput = UncertaintyOutput;

// --- Entradas y Salidas de Sesgo ---
export interface SesgoInput {
  medidas: number[];
  referencia: number[];    // requerido si porcentaje=false
  porcentaje: boolean;     // default false
}
export type SesgoOutput = UncertaintyOutput;
