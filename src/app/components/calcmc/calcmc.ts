import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { mean, stdDev, tInv } from './stats.utils';

interface FuenteIncertidumbre {
  nombre: string;
  valor: number;
  dof: number;
  peso: number;
}

@Component({
  selector: 'app-calcmc',
  imports: [CommonModule, FormsModule],
  templateUrl: './calcmc.html',
  styleUrl: './calcmc.css',
})
export class Calcmc {

  // ------------------- ENTRADAS -------------------
  erroresTexto          = signal<string>('-0.024, -0.031, 0.015');
  incertidumbresTexto   = signal<string>('0.080, 0.094, 0.080');
  tiempoIntermedioTexto = signal<string>('393, 642');
  intervaloCalibracion  = signal<number>(24);     // meses
  resolucion            = signal<number>(0.001);  // unidades del mensurando

  // Convenciones del script R
  repetibilidad         = signal<number>(0.0005);
  reproducibilidad      = signal<number>(0.0005);
  dofRepetibilidad      = signal<number>(27);     // 10*3 - 3
  dofReproducibilidad   = signal<number>(2);      // 3 - 1
  kReferencia           = signal<number>(2);

  // Nivel de confianza para el coeficiente de expansión
  // El R usa qt(0.05, ..., lower.tail=FALSE) → cuantil 0.95 unilateral
  nivelConfianza        = signal<number>(0.95);
  // ------------------- CONTROL DE SECCIÓN AVANZADA -------------------
  // Señal que controla la visibilidad de los parámetros de R&R
  mostrarAvanzado = signal<boolean>(false);

  /** Alterna la visibilidad de la sección avanzada */
  toggleAvanzado(): void {
    this.mostrarAvanzado.update((v) => !v);
  }

  // ------------------- PARSER -------------------
  private parseList(texto: string): number[] {
    return texto
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
  }

  // ------------------- CÁLCULO PRINCIPAL -------------------
  resultado = computed(() => {
    const errores          = this.parseList(this.erroresTexto());
    const incertidumbres   = this.parseList(this.incertidumbresTexto());
    const tiempoIntermedio = this.parseList(this.tiempoIntermedioTexto());
    const meses            = this.intervaloCalibracion();
    const res              = this.resolucion();

    // Validaciones mínimas
    if (
      errores.length < 2 ||
      incertidumbres.length !== errores.length ||
      tiempoIntermedio.length !== errores.length - 1
    ) {
      return null;
    }

    // ---- 1. Fuentes derivadas ----
    const estabilidad = stdDev(errores);
    const sesgo       = errores[errores.length - 1];

    const derivaIndividual: number[] = [];
    for (let i = 0; i < tiempoIntermedio.length; i++) {
      derivaIndividual.push(
        Math.abs(errores[i + 1] - errores[i]) / tiempoIntermedio[i]
      );
    }
    const deriva = mean(derivaIndividual) * meses * (365 / 12);

    const incertRef    = incertidumbres[incertidumbres.length - 1];
    const estabilidadRef = stdDev(incertidumbres);

    // ---- 2. Incertidumbres estándar (8 fuentes) ----
    const incEstabilidad = estabilidad;
    const incSesgo       = sesgo;                    // R no toma abs()
    const incDeriva      = deriva;
    const incResolucion  = res / Math.sqrt(3);
    const incIncertRef   = incertRef / this.kReferencia();
    const incEstabRef    = estabilidadRef;
    const incRepetibilidad     = this.repetibilidad();
    const incReproducibilidad  = this.reproducibilidad();

    const fuentes: FuenteIncertidumbre[] = [
      { nombre: 'Estabilidad',             valor: incEstabilidad,       dof: 2,                    peso: 0 },
      { nombre: 'Sesgo',                   valor: incSesgo,             dof: 1,                    peso: 0 },
      { nombre: 'Deriva',                  valor: incDeriva,            dof: 2,                    peso: 0 },
      { nombre: 'Resolución',              valor: incResolucion,        dof: 1e100,                peso: 0 },
      { nombre: 'Inc. referencia',         valor: incIncertRef,         dof: 99,                   peso: 0 },
      { nombre: 'Estabilidad referencia',  valor: incEstabRef,          dof: 2,                    peso: 0 },
      { nombre: 'Repetibilidad',           valor: incRepetibilidad,     dof: this.dofRepetibilidad(),    peso: 0 },
      { nombre: 'Reproducibilidad',        valor: incReproducibilidad,  dof: this.dofReproducibilidad(), peso: 0 },
    ];

    // ---- 3. Incertidumbre combinada ----
    const sumaCuadrados = fuentes.reduce((a, f) => a + f.valor ** 2, 0);
    const incCombinada  = Math.sqrt(sumaCuadrados);

    // ---- 4. Welch-Satterthwaite ----
    const denom = fuentes.reduce(
      (a, f) => a + (f.dof > 0 ? f.valor ** 4 / f.dof : 0),
      0
    );
    const dofEfectivos = denom > 0
      ? Math.round(incCombinada ** 4 / denom)
      : 0;

    // ---- 5. Coeficiente de expansión ----
    // R: qt(0.05, dof, lower.tail = FALSE)  →  tInv(0.95, dof)
    const probAcumulada = this.nivelConfianza();
    const coefExpansion = dofEfectivos > 0
      ? tInv(probAcumulada, dofEfectivos)
      : 0;

    // ---- 6. Incertidumbre expandida ----
    const incExpandida = coefExpansion * incCombinada;

    // ---- 7. Pesos porcentuales ----
    fuentes.forEach((f) => {
      f.peso = sumaCuadrados > 0 ? (100 * f.valor ** 2) / sumaCuadrados : 0;
    });

    return {
      fuentes,
      incCombinada,
      incExpandida,
      coefExpansion,
      dofEfectivos,
      // Intermedios útiles para mostrar
      estabilidad,
      sesgo,
      deriva,
      incertRef,
      estabilidadRef,
    };
  });

  // ------------------- UTILIDADES DE FORMATO -------------------
  fmt(n: number, d = 6): string {
    if (!isFinite(n)) return '∞';
    if (Math.abs(n) !== 0 && (Math.abs(n) < 1e-3 || Math.abs(n) >= 1e5)) {
      return n.toExponential(3);
    }
    return n.toFixed(d);
  }

  reset(): void {
    this.erroresTexto.set('-0.024, -0.031, 0.015');
    this.incertidumbresTexto.set('0.080, 0.094, 0.080');
    this.tiempoIntermedioTexto.set('393, 642');
    this.intervaloCalibracion.set(24);
    this.resolucion.set(0.001);
  }
}
