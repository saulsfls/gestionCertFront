import { Injectable } from '@angular/core';
import {
  CmcFuenteIncertidumbre,
  CmcPayload,
  CmcResultado,
} from '../../models/cmc.model';
import { RStatsUtils } from '../../models/r.stats.util';

/**
 * Estructura que representa una fila de la tabla "Valores seleccionados".
 * Se utiliza para recibir los datos desde el configurador y mostrarlos en la vista.
 */
export interface ResumenTablaCmc {
  index: number;
  cc: string;
  fila: string;
  intervalo: string;
  refMin: string;
  refMax: string;
  dias: number | null;
  sesgo: string;
  incertidumbre: string;
}

/**
 * ViewModel unificado: contiene el payload original, el resultado del cálculo,
 * el resumen de la tabla y un posible mensaje de error.
 */
export interface CmcVistaResultado {
  payload: CmcPayload;
  resultado: CmcResultado | null;
  resumen: ResumenTablaCmc[];
  error?: string;
}

/** Definición estática de cada fuente de incertidumbre. */
interface FuenteDefinicion {
  clave: string;
  nombre: string;
  dof: number;
}

@Injectable({ providedIn: 'root' })
export class CmcCalculatorService {
  /** Convenciones del script R cuando no hay datos de R&R */
  private readonly REPETIBILIDAD_DEFAULT = 0.0005;
  private readonly REPRODUCIBILIDAD_DEFAULT = 0.0005;

  /** Grados de libertad por defecto */
  private readonly DOF_REPETIBILIDAD = 27;      // 9 * 3
  private readonly DOF_REPRODUCIBILIDAD = 2;    // 3 - 1

  /** Nivel de confianza para la t de Student (95%, una cola) — solo referencia */
  private readonly CONFIANZA_UNA_COLA = 0.95;

  /** Factor de cobertura k para la incertidumbre expandida */
  private readonly FACTOR_COBERTURA_K = 2;

  /**
   * Orden y metadatos de las fuentes de incertidumbre.
   * Debe coincidir 1:1 con el arreglo `incEstandar` que se construye en `calcular`.
   */
  private readonly FUENTES_DEF: FuenteDefinicion[] = [
    { clave: 'estabilidad',            nombre: 'Estabilidad',                    dof: 2 },
    { clave: 'sesgo',                  nombre: 'Sesgo (BIAS)',                   dof: 1 },
    { clave: 'deriva',                 nombre: 'Deriva (Drift)',                 dof: 2 },
    { clave: 'incertRefEstandar',      nombre: 'Incertidumbre de la referencia', dof: 99 },
    { clave: 'estabilidadRefEstandar', nombre: 'Estabilidad de la referencia',   dof: 2 },
    { clave: 'repetibilidad',          nombre: 'Repetibilidad',                  dof: this.DOF_REPETIBILIDAD },
    { clave: 'reproducibilidad',       nombre: 'Reproducibilidad',               dof: this.DOF_REPRODUCIBILIDAD },
  ];

  // ============================================================
  //   API PRINCIPAL (Intermediario para la Vista)
  // ============================================================

  /**
   * Procesa un arreglo de payloads y los cruza con sus resúmenes de tablas.
   * Atrapa los errores de cálculo para que el componente no tenga que hacerlo.
   */
  procesarResultados(
    payloads: CmcPayload[],
    resumenes: Record<number, ResumenTablaCmc[]>
  ): CmcVistaResultado[] {
    return (payloads ?? []).map(payload => {
      const resumen = resumenes?.[payload.cmcNumero] ?? [];
      try {
        const resultado = this.calcular(payload);
        return { payload, resultado, resumen };
      } catch (e: any) {
        console.error(
          `[CmcCalculatorService] Error calculando CMC #${payload?.cmcNumero}:`,
          e
        );
        return {
          payload,
          resultado: null,
          resumen,
          error: e?.message ?? 'Error desconocido en el cálculo',
        };
      }
    });
  }

  // ============================================================
  //   LÓGICA DE CÁLCULO INTERNA
  // ============================================================

  /**
   * Calcula las incertidumbres y pesos para un solo CMC.
   * Si los datos no son suficientes, lanza una excepción.
   */
  private calcular(payload: CmcPayload): CmcResultado {
    const {
      errores,
      incertidumbres,
      tiempoIntermedio,
      intervaloCalibracion,
      cmcNumero,
      rangoReferencia,
      certificados,
    } = payload;

    if (errores.length < 2) {
      throw new Error('Se requieren al menos 2 errores para calcular el CMC.');
    }
    if (tiempoIntermedio.length !== errores.length - 1) {
      throw new Error(
        'El número de tiempos intermedios no coincide con el número de errores.'
      );
    }

    // --------------------------------------------------------
    //   Estabilidad  = sd(errores)   [R: sd(x) === sqrt(var(x))]
    // --------------------------------------------------------
    const estabilidad = RStatsUtils.sd(errores);

    // --------------------------------------------------------
    //   Sesgo = último error
    // --------------------------------------------------------
    const sesgo = errores[errores.length - 1];

    // --------------------------------------------------------
    //   Deriva
    // --------------------------------------------------------
    const derivaIndividual = tiempoIntermedio.map(
      (t, i) => Math.abs(errores[i + 1] - errores[i]) / t
    );
    const deriva =
      RStatsUtils.mean(derivaIndividual) * intervaloCalibracion * (365 / 12);

    // --------------------------------------------------------
    //   Incertidumbre y estabilidad de la referencia
    // --------------------------------------------------------
    const incertRefEstandar = incertidumbres[incertidumbres.length - 1] / 2;
    const estabilidadRefEstandar = RStatsUtils.sd(incertidumbres);

    // --------------------------------------------------------
    //   R&R (por convención)
    // --------------------------------------------------------
    const repetibilidad = this.REPETIBILIDAD_DEFAULT;
    const reproducibilidad = this.REPRODUCIBILIDAD_DEFAULT;

    // --------------------------------------------------------
    //   Incertidumbres estándar (mismo orden que FUENTES_DEF)
    // --------------------------------------------------------
    const incEstandar: number[] = [
      estabilidad,
      sesgo,
      deriva,
      incertRefEstandar,
      estabilidadRefEstandar,
      repetibilidad,
      reproducibilidad,
    ];

    // --------------------------------------------------------
    //   Incertidumbre combinada
    // --------------------------------------------------------
    const sumaCuadrados = incEstandar.reduce((s, v) => s + v * v, 0);
    const incertidumbreCombinada = Math.sqrt(sumaCuadrados);

    // --------------------------------------------------------
    //   Grados de libertad efectivos (Welch–Satterthwaite)
    // --------------------------------------------------------
    const denominador = incEstandar.reduce(
      (s, v, i) => s + Math.pow(v, 4) / this.FUENTES_DEF[i].dof,
      0
    );
    const dofEfectivos =
      denominador === 0 || incertidumbreCombinada === 0
        ? 0
        : Math.round(Math.pow(incertidumbreCombinada, 4) / denominador);

    // --------------------------------------------------------
    //   Coeficiente de expansión (t de Student, 95% una cola)
    //   R equivalente: qt(0.95, dofEfectivos)
    //   ⚠️ Solo REFERENCIA: la incertidumbre expandida usa k = 2.
    // --------------------------------------------------------
    const coefExpansion =
      dofEfectivos > 0
        ? RStatsUtils.qt(this.CONFIANZA_UNA_COLA, dofEfectivos)
        : NaN;

    // --------------------------------------------------------
    //   Incertidumbre expandida con k = 2 (cobertura fija)
    // --------------------------------------------------------
    const incertidumbreExpandida =
      this.FACTOR_COBERTURA_K * incertidumbreCombinada;

    // --------------------------------------------------------
    //   Pesos porcentuales
    // --------------------------------------------------------
    const fuentes: CmcFuenteIncertidumbre[] = incEstandar.map((valor, i) => ({
      clave: this.FUENTES_DEF[i].clave,
      nombre: this.FUENTES_DEF[i].nombre,
      valor,
      dof: this.FUENTES_DEF[i].dof,
      pesoPct: sumaCuadrados === 0 ? 0 : (100 * valor * valor) / sumaCuadrados,
    }));

    return {
      estabilidad,
      sesgo,
      deriva,
      incertRefEstandar,
      estabilidadRefEstandar,
      repetibilidad,
      reproducibilidad,
      incertidumbreCombinada,
      dofEfectivos,
      coefExpansion,
      incertidumbreExpandida,
      fuentes,
      cmcNumero,
      rangoReferencia,
      certificados,
    };
  }
}