import { Injectable } from '@angular/core';
import {
  CmcFuenteIncertidumbre,
  CmcPayload,
  CmcResultado,
} from '../models/cmc.model';

// El calculo del CMC no tiene el calculo de la resolucion integrado

@Injectable({ providedIn: 'root' })
export class CmcCalculatorService {
  /** Convenciones del script R cuando no hay datos de R&R */
  private readonly REPETIBILIDAD_DEFAULT = 0.0005;
  private readonly REPRODUCIBILIDAD_DEFAULT = 0.0005;

  /**
   * Grados de libertad por defecto (los mismos que produce el script R
   * cuando hay 10 mediciones por 3 operadores).
   */
  private readonly DOF_REPETIBILIDAD = 27;      // 9 * 3
  private readonly DOF_REPRODUCIBILIDAD = 2;    // 3 - 1

  // ------------------------------------------------------------
  //   API principal
  // ------------------------------------------------------------

  calcular(payload: CmcPayload): CmcResultado {
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
    //   Estabilidad  = sqrt(var(errores))
    // --------------------------------------------------------
    const estabilidad = Math.sqrt(this.varianzaMuestral(errores));

    // --------------------------------------------------------
    //   Sesgo = último error
    // --------------------------------------------------------
    const sesgo = errores[errores.length - 1];

    // --------------------------------------------------------
    //   Deriva
    // --------------------------------------------------------
    const derivaIndividual: number[] = [];
    for (let i = 0; i < tiempoIntermedio.length; i++) {
      derivaIndividual.push(
        Math.abs(errores[i + 1] - errores[i]) / tiempoIntermedio[i]
      );
    }
    const deriva =
      this.media(derivaIndividual) * intervaloCalibracion * (365 / 12);

    // --------------------------------------------------------
    //   Incertidumbre y estabilidad de la referencia
    // --------------------------------------------------------
    const incertRefEstandar =
      incertidumbres[incertidumbres.length - 1] / 2;
    const estabilidadRefEstandar = Math.sqrt(
      this.varianzaMuestral(incertidumbres)
    );

    // --------------------------------------------------------
    //   R&R (por convención)
    // --------------------------------------------------------
    const repetibilidad = this.REPETIBILIDAD_DEFAULT;
    const reproducibilidad = this.REPRODUCIBILIDAD_DEFAULT;

    // --------------------------------------------------------
    //   Incertidumbres estándar y grados de libertad
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
    const dofs: number[] = [
      2,                            // estabilidad
      1,                            // sesgo
      2,                            // deriva
      99,                           // incert. ref.
      2,                            // estabilidad ref.
      this.DOF_REPETIBILIDAD,       // repetibilidad
      this.DOF_REPRODUCIBILIDAD,    // reproducibilidad
    ];
    const claves = [
      'estabilidad',
      'sesgo',
      'deriva',
      'incertRefEstandar',
      'estabilidadRefEstandar',
      'repetibilidad',
      'reproducibilidad',
    ];
    const nombres = [
      'Estabilidad',
      'Sesgo (BIAS)',
      'Deriva (Drift)',
      'Incertidumbre de la referencia',
      'Estabilidad de la referencia',
      'Repetibilidad',
      'Reproducibilidad',
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
      (s, v, i) => s + Math.pow(v, 4) / dofs[i],
      0
    );
    const dofEfectivos = Math.round(
      Math.pow(incertidumbreCombinada, 4) / denominador
    );

    // --------------------------------------------------------
    //   Coeficiente de expansión (t de Student, 95% una cola)
    //   Equivalente a qt(0.05, df, lower.tail = FALSE)
    // --------------------------------------------------------
    const coefExpansion = this.tQuantile(0.05, dofEfectivos);

    // --------------------------------------------------------
    //   Incertidumbre expandida
    // --------------------------------------------------------
    const incertidumbreExpandida = coefExpansion * incertidumbreCombinada;

    // --------------------------------------------------------
    //   Pesos porcentuales
    // --------------------------------------------------------
    const fuentes: CmcFuenteIncertidumbre[] = incEstandar.map((valor, i) => ({
      clave: claves[i],
      nombre: nombres[i],
      valor,
      dof: dofs[i],
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

  /** Calcula para múltiples CMC y devuelve sólo los que no fallan. */
  calcularVarios(payloads: CmcPayload[]): CmcResultado[] {
    const salida: CmcResultado[] = [];
    for (const p of payloads) {
      try {
        salida.push(this.calcular(p));
      } catch (e) {
        console.error(`Error calculando CMC #${p.cmcNumero}`, e);
      }
    }
    return salida;
  }

  // ------------------------------------------------------------
  //   Helpers estadísticos
  // ------------------------------------------------------------

  private media(xs: number[]): number {
    if (!xs.length) return 0;
    return xs.reduce((s, v) => s + v, 0) / xs.length;
  }

  /** Varianza muestral (denominador n-1), igual que var() en R. */
  private varianzaMuestral(xs: number[]): number {
    const n = xs.length;
    if (n < 2) return 0;
    const m = this.media(xs);
    return xs.reduce((s, v) => s + (v - m) * (v - m), 0) / (n - 1);
  }

  // ------------------------------------------------------------
  //   t de Student: cuantil superior (equivalente a qt(...))
  // ------------------------------------------------------------

  /** Devuelve t tal que P(T > t) = p  (p.ej. p=0.05 → 95% una cola). */
  private tQuantile(p: number, df: number): number {
    if (df <= 0) return NaN;
    const objetivo = 1 - p; // acumulada

    // Bisección sobre la CDF
    let lo = -1e3;
    let hi = 1e3;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (this.tCdf(mid, df) < objetivo) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** CDF de la t de Student. */
  private tCdf(t: number, df: number): number {
    const x = df / (df + t * t);
    const ib = this.betai(df / 2, 0.5, x);
    return t > 0 ? 1 - ib / 2 : ib / 2;
  }

  /** Regularized incomplete beta function I_x(a,b). */
  private betai(a: number, b: number, x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(
      this.logGamma(a + b) -
        this.logGamma(a) -
        this.logGamma(b) +
        a * Math.log(x) +
        b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) {
      return (bt * this.betacf(a, b, x)) / a;
    }
    return 1 - (bt * this.betacf(b, a, 1 - x)) / b;
  }

  /** Continued fraction para la beta incompleta (Numerical Recipes). */
  private betacf(a: number, b: number, x: number): number {
    const MAXIT = 200;
    const EPS = 3e-12;
    const FPMIN = 1e-300;

    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;

    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;

      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  /** Log-gamma (aproximación de Lanczos). */
  private logGamma(x: number): number {
    const cof = [
      76.18009172947146,
      -86.50532032941677,
      24.01409824083091,
      -1.231739572450155,
      0.1208650973866179e-2,
      -0.5395239384953e-5,
    ];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) {
      ser += cof[j] / ++y;
    }
    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  }
}
