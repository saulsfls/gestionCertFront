import { Service, inject } from '@angular/core';
import { RStatsUtils } from '../../models/r.stats.util';
import {
  DerivaInput, DerivaOutput,
  RepetibilidadInput, RepetibilidadOutput,
  EstabilidadInput, EstabilidadOutput,
  ReferenciaInput, ReferenciaOutput,
} from '../../models/inc.cal.models';

@Service()
export class IncCalService {
  private readonly stats = RStatsUtils;


  // 1. DERIVA  (JCGM 100:2008)

  calcularDeriva(input: DerivaInput): DerivaOutput {
    const { errores, tiempoIntermedio, intervaloCalibracion } = input;

    if (errores.length !== tiempoIntermedio.length + 1) {
      throw new Error(
        'errores debe tener exactamente (tiempoIntermedio.length + 1) elementos'
      );
    }
    if (tiempoIntermedio.some(t => t <= 0)) {
      throw new Error('Los tiempos intermedios deben ser positivos');
    }
    if (intervaloCalibracion <= 0) {
      throw new Error('El intervalo de calibración debe ser positivo');
    }

    // deriva.individual[i] = |errores[i+1] - errores[i]| / tiempo.intermedio[i]
    const derivaIndividual = this.stats
      .diff(errores)
      .map((d, i) => Math.abs(d) / tiempoIntermedio[i]);

    // deriva = mean(deriva.individual) * intervalo.calibracion * (365/12) / sqrt(3)
    const deriva =
      this.stats.mean(derivaIndividual) *
      intervaloCalibracion *
      (365 / 12) /
      Math.sqrt(3);

    // dof.deriva = 1e100 (efectivamente infinito)
    const dofDeriva = 1e100;

    return { derivaIndividual, deriva, dofDeriva };
  }


  // 2. REPETIBILIDAD Y REPRODUCIBILIDAD
  //    (ISO 5725-3 & NIST/SEMATECH)

  calcularRepetibilidad(input: RepetibilidadInput): RepetibilidadOutput {
    const { datos, porcentaje = true, referencia } = input;

    if (!datos || datos.length < 2) {
      throw new Error('Se requieren al menos 2 operadores');
    }
    const cols = this.stats.ncol(datos);
    if (cols < 2) {
      throw new Error('Cada operador debe tener al menos 2 medidas');
    }
    if (datos.some(r => r.length !== cols)) {
      throw new Error('Todas las filas deben tener la misma longitud');
    }
    if (porcentaje) {
      if (referencia == null) {
        throw new Error('referencia es obligatoria cuando porcentaje=true');
      }
      if (referencia === 0) {
        throw new Error('referencia no puede ser 0');
      }
    }

    const datosProc = porcentaje
      ? this.stats.toPercent(datos, referencia!)
      : datos;

    // Repetibilidad
    const stdev = this.stats.sdByRow(datosProc);       // sd por operador
    const dof   = this.stats.dofByRow(datosProc);      // n_i - 1
    const repetibilidad = this.stats.pooledSd(stdev, dof);
    const dofRepetibilidad = dof.reduce((a, b) => a + b, 0);

    // Reproducibilidad
    const medias = this.stats.meanByRow(datosProc);
    const reproducibilidad = Math.sqrt(this.stats.variance(medias));
    const dofReproducibilidad = this.stats.nrow(datosProc) - 1;

    return {
      repetibilidad,
      dofRepetibilidad,
      reproducibilidad,
      dofReproducibilidad,
    };
  }


  // 3. ESTABILIDAD (JCGM 100:2008 §4.3.3, §4.3.4)

  calcularEstabilidad(input: EstabilidadInput): EstabilidadOutput {
    const { errores } = input;
    if (!errores || errores.length < 2) {
      throw new Error('Se requieren al menos 2 errores para estimar estabilidad');
    }
    const estabilidad = Math.sqrt(this.stats.variance(errores));
    const dofEstabilidad = errores.length - 1;
    return { estabilidad, dofEstabilidad };
  }


  // 4. INCERTIDUMBRE ESTÁNDAR DE LA REFERENCIA

  calcularReferencia(input: ReferenciaInput): ReferenciaOutput {
    const { incertidumbres } = input;
    if (!incertidumbres || incertidumbres.length === 0) {
      throw new Error('incertidumbres no puede estar vacío');
    }
    const refIncStd = incertidumbres[incertidumbres.length - 1] / 2;
    const dofRefIncStd = 1e100;
    return { refIncStd, dofRefIncStd };
  }

}
