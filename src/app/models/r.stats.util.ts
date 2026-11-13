/** Resultado de una regresión lineal simple (equivalente a lm(y ~ x) en R). */
export interface LmResult {
  intercept: number;   // coeficiente a (ordenada al origen)
  slope: number;       // coeficiente b (pendiente)
  r2: number;          // R²
  r: number;           // correlación de Pearson
  residuals: number[]; // residuos y - ŷ
  fitted: number[];    // valores ajustados ŷ
  n: number;
}

/** Tipo de cuantil (mismos que R: type 1..9). Por defecto type 7, el de R. */
export type QuantileType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * Utilidades estadísticas inspiradas en funciones base de R.
 * Métodos estáticos y puros (sin estado, sin dependencias externas).
 *
 * Equivalencias con R:
 *  - mean()     → mean(x)
 *  - median()   → median(x)
 *  - variance() → var(x)
 *  - sd()       → sd(x)
 *  - quantile() → quantile(x, probs, type)
 *  - cor()      → cor(x, y)
 *  - lm()       → lm(y ~ x)
 *  - qt()       → qt(p, df)
 *  - pt()       → pt(q, df)
 */
export class RStatsUtils {
  private constructor() {}
  //   ESTADÍSTICA DESCRIPTIVA
  /** Media aritmética. R: mean(x) */
  static mean(xs: number[]): number {
    if (!xs?.length) return 0;
    return xs.reduce((s, v) => s + v, 0) / xs.length;
  }

  /** Mediana. R: median(x) */
  static median(xs: number[]): number {
    if (!xs?.length) return NaN;
    const sorted = [...xs].sort((a, b) => a - b);
    const n = sorted.length;
    const mid = Math.floor(n / 2);
    return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /** Varianza muestral (denominador n-1). R: var(x) */
  static variance(xs: number[]): number {
    const n = xs?.length ?? 0;
    if (n < 2) return 0;
    const m = RStatsUtils.mean(xs);
    return xs.reduce((s, v) => s + (v - m) * (v - m), 0) / (n - 1);
  }

  /** Desviación estándar muestral. R: sd(x) */
  static sd(xs: number[]): number {
    return Math.sqrt(RStatsUtils.variance(xs));
  }

  /**
   * Cuantiles. R: quantile(x, probs, type = 7)
   * @param probs probabilidades (0..1). Ej: [0.25, 0.5, 0.75]
   * @param type  algoritmo de R (1..9). Por defecto 7 (el de R).
   */
  static quantile(
    xs: number[],
    probs: number[],
    type: QuantileType = 7
  ): number[] {
    if (!xs?.length) return probs.map(() => NaN);
    const x = [...xs].sort((a, b) => a - b);
    const n = x.length;

    return probs.map(p => {
      if (p < 0 || p > 1) return NaN;
      // Índice continuo h según tipo
      let h: number;

      switch (type) {
        case 1: {
          if (p === 0) return x[0];
          const j = Math.ceil(n * p);
          return x[j - 1];
        }
        case 2: {
          if (p === 0) return x[0];
          const j = Math.ceil(n * p);
          return j === 1 ? x[0] : (x[j - 2] + x[j - 1]) / 2;
        }
        case 3: {
          const j = Math.round(n * p);
          return j <= 0 ? x[0] : x[j - 1];
        }
        default: {
          // Tipos 4..9 usan interpolación con h
          if (type === 4) h = n * p;
          else if (type === 5) h = n * p + 0.5;
          else if (type === 6) h = (n + 1) * p;
          else if (type === 7) h = (n - 1) * p + 1;
          else if (type === 8) h = (n + 1 / 3) * p + 1 / 3;
          else h = (n + 1 / 4) * p + 3 / 8; // type 9

          if (h <= 1) return x[0];
          if (h >= n) return x[n - 1];
          const lo = Math.floor(h);
          const frac = h - lo;
          return x[lo - 1] + frac * (x[lo] - x[lo - 1]);
        }
      }
    });
  }

  /** Resumen de 5 números + media. R: summary(x) (parcial) */
  static summary(xs: number[]): {
    min: number;
    q1: number;
    median: number;
    mean: number;
    q3: number;
    max: number;
  } {
    if (!xs?.length) {
      return { min: NaN, q1: NaN, median: NaN, mean: NaN, q3: NaN, max: NaN };
    }
    const [q1, med, q3] = RStatsUtils.quantile(xs, [0.25, 0.5, 0.75]);
    return {
      min: Math.min(...xs),
      q1,
      median: med,
      mean: RStatsUtils.mean(xs),
      q3,
      max: Math.max(...xs),
    };
  }
  //   CORRELACIÓN
  /** Covarianza muestral. R: cov(x, y) */
  static cov(x: number[], y: number[]): number {
    const n = Math.min(x?.length ?? 0, y?.length ?? 0);
    if (n < 2) return 0;
    const mx = RStatsUtils.mean(x.slice(0, n));
    const my = RStatsUtils.mean(y.slice(0, n));
    let s = 0;
    for (let i = 0; i < n; i++) s += (x[i] - mx) * (y[i] - my);
    return s / (n - 1);
  }

  /** Correlación de Pearson. R: cor(x, y) */
  static cor(x: number[], y: number[]): number {
    const sx = RStatsUtils.sd(x);
    const sy = RStatsUtils.sd(y);
    if (sx === 0 || sy === 0) return NaN;
    return RStatsUtils.cov(x, y) / (sx * sy);
  }
  //   REGRESIÓN LINEAL SIMPLE
  /**
   * Regresión lineal simple por mínimos cuadrados. R: lm(y ~ x)
   * Devuelve intercepto, pendiente, R², r, residuos y ajustados.
   */
  static lm(x: number[], y: number[]): LmResult {
    const n = Math.min(x?.length ?? 0, y?.length ?? 0);
    if (n < 2) {
      return { intercept: NaN, slope: NaN, r2: NaN, r: NaN, residuals: [], fitted: [], n };
    }
    const xs = x.slice(0, n);
    const ys = y.slice(0, n);
    const mx = RStatsUtils.mean(xs);
    const my = RStatsUtils.mean(ys);

    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) * (xs[i] - mx);
    }
    const slope = sxx === 0 ? NaN : sxy / sxx;
    const intercept = my - slope * mx;

    const fitted = xs.map(xi => intercept + slope * xi);
    const residuals = ys.map((yi, i) => yi - fitted[i]);

    const r = RStatsUtils.cor(xs, ys);
    const r2 = r * r;

    return { intercept, slope, r2, r, residuals, fitted, n };
  }

  //   DISTRIBUCIÓN T DE STUDENT
  /**
   * Cuantil de la t de Student (CDF acumulada, cola izquierda).
   * R: qt(p, df)   →   p = 0.95 para 95% una cola.
   */
  static qt(p: number, df: number): number {
    if (df <= 0) return NaN;
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;

    let lo = -1e3;
    let hi = 1e3;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (RStatsUtils.pt(mid, df) < p) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** Cuantil t con semántica de cola derecha. qtUpper(0.05, df) === qt(0.95, df) */
  static qtUpper(pColaDerecha: number, df: number): number {
    return RStatsUtils.qt(1 - pColaDerecha, df);
  }

  /** CDF de la t de Student. R: pt(q, df) */
  static pt(t: number, df: number): number {
    const x = df / (df + t * t);
    const ib = RStatsUtils.betai(df / 2, 0.5, x);
    return t > 0 ? 1 - ib / 2 : ib / 2;
  }

  //   FUNCIONES BETA INCOMPLETA (base de pt/qt)
  /** Regularized incomplete beta function I_x(a,b). */
  static betai(a: number, b: number, x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(
      RStatsUtils.logGamma(a + b) -
        RStatsUtils.logGamma(a) -
        RStatsUtils.logGamma(b) +
        a * Math.log(x) +
        b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) {
      return (bt * RStatsUtils.betacf(a, b, x)) / a;
    }
    return 1 - (bt * RStatsUtils.betacf(b, a, 1 - x)) / b;
  }

  /** Continued fraction para la beta incompleta (Numerical Recipes). */
  private static betacf(a: number, b: number, x: number): number {
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
  static logGamma(x: number): number {
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
  // dentro de la clase RStatsUtils
  /** Diferencias consecutivas. R: diff(x) */
  static diff(xs: number[]): number[] {
    if (!xs || xs.length < 2) return [];
    const out: number[] = [];
    for (let i = 1; i < xs.length; i++) out.push(xs[i] - xs[i - 1]);
    return out;
  }

  /** Valor absoluto elemento a elemento. R: abs(x) */
  static abs(xs: number[]): number[] {
    return xs.map(v => Math.abs(v));
  }

  /** Raíz cuadrada elemento a elemento. R: sqrt(x) */
  static sqrt(xs: number[]): number[] {
    return xs.map(v => Math.sqrt(v));
  }

  /** Media de una matriz (todos los elementos). R: mean(as.matrix(x)) */
  static meanMatrix(m: number[][]): number {
    const flat = m.flat();
    return RStatsUtils.mean(flat);
  }

  /**
   * Desviación estándar por filas (operadores). R: apply(x, 1, sd)
   * Cada fila es un operador.
   */
  static sdByRow(m: number[][]): number[] {
    return m.map(row => RStatsUtils.sd(row));
  }

  /**
   * Grados de libertad por fila: length - 1. R: apply(x, 1, function(x) length(x) - 1)
   */
  static dofByRow(m: number[][]): number[] {
    return m.map(row => row.length - 1);
  }

  /** Medias por fila. R: apply(x, 1, mean) */
  static meanByRow(m: number[][]): number[] {
    return m.map(row => RStatsUtils.mean(row));
  }

  /** Número de columnas. R: ncol(x) */
  static ncol(m: number[][]): number {
    return m.length ? m[0].length : 0;
  }

  /** Número de filas. R: nrow(x) */
  static nrow(m: number[][]): number {
    return m.length;
  }

  /**
   * Convierte matriz a % respecto a referencia:
   *   100 * (x - ref) / ref
   */
  static toPercent(m: number[][], referencia: number): number[][] {
    return m.map(row => row.map(v => (100 * (v - referencia)) / referencia));
  }

  /**
   * Suma ponderada por grados de libertad para varianza combinada:
   *   ss = dof * sd^2 ; repetibilidad = sqrt(sum(ss)/sum(dof))
   */
  static pooledSd(sdByRow: number[], dofByRow: number[]): number {
    let ss = 0;
    let dofTot = 0;
    for (let i = 0; i < sdByRow.length; i++) {
      ss += dofByRow[i] * sdByRow[i] ** 2;
      dofTot += dofByRow[i];
    }
    return dofTot > 0 ? Math.sqrt(ss / dofTot) : 0;
  }
}
