import { Service } from '@angular/core';
import { RStatsUtils } from '../../models/r.stats.util';
import {
  DerivaInput,
  RepetibilidadInput,
  ReproducibilidadInput,
  EstabilidadInput,
  ReferenciaInput,
  SesgoInput,
  UncertaintyOutput,
} from '../../models/inc.cal.models';

const DOF_INF = 1e100;

@Service()
export class IncCalService {
  private readonly stats = RStatsUtils;

  // 1. DERIVA — JCGM 100:2008
  calcularDeriva(input: DerivaInput): UncertaintyOutput {
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

    const derivaIndividual = this.stats
      .diff(errores)
      .map((d, i) => Math.abs(d) / tiempoIntermedio[i]);

    const uncertainty =
      this.stats.mean(derivaIndividual) *
      intervaloCalibracion *
      (365 / 12);

    return { uncertainty, dof: DOF_INF };
  }

  // 2. REPETIBILIDAD — ISO 5725-3 & NIST/SEMATECH
  calcularRepetibilidad(input: RepetibilidadInput): UncertaintyOutput {
    const { datos, porcentaje = true, referencia } = input;

    if (!datos || datos.length < 1) {
      throw new Error('datos no puede estar vacío');
    }
    const cols = this.stats.ncol(datos);
    if (cols < 2) {
      throw new Error('Se requieren al menos 2 operadores (columnas)');
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

    const stdev = this.stats.sdByRow(datosProc);
    const dofArr = this.stats.dofByRow(datosProc);
    const uncertainty = this.stats.pooledSd(stdev, dofArr);
    const dof = dofArr.reduce((a, b) => a + b, 0);

    return { uncertainty, dof };
  }

  // 3. REPRODUCIBILIDAD — ISO 5725-3 & NIST/SEMATECH
  calcularReproducibilidad(input: ReproducibilidadInput): UncertaintyOutput {
    const { datos, porcentaje = true, referencia } = input;

    if (!datos || datos.length < 1) {
      throw new Error('datos no puede estar vacío');
    }
    const cols = this.stats.ncol(datos);
    if (cols < 2) {
      throw new Error('Se requieren al menos 2 operadores (columnas)');
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

    const medias = this.stats.meanByRow(datosProc);
    const uncertainty = Math.sqrt(this.stats.variance(medias));
    const dof = this.stats.nrow(datosProc) - 1;

    return { uncertainty, dof };
  }

  // 4. ESTABILIDAD — JCGM 100:2008 §4.3.3, §4.3.4
  calcularEstabilidad(input: EstabilidadInput): UncertaintyOutput {
    const { errores } = input;
    if (!errores || errores.length < 2) {
      throw new Error('Se requieren al menos 2 errores para estimar estabilidad');
    }
    const uncertainty = Math.sqrt(this.stats.variance(errores));
    return { uncertainty, dof: DOF_INF };
  }

  // 5. SESGO — JCGM 100:2008
  calcularSesgo(input: SesgoInput): UncertaintyOutput {
    const { medidas, referencia, porcentaje = false } = input;

    if (!medidas || medidas.length === 0) {
      throw new Error('medidas no puede estar vacío');
    }

    let uncertainty: number;
    if (porcentaje) {
      uncertainty = Math.abs(this.stats.mean(medidas));
    } else {
      if (!referencia) {
        throw new Error('referencia es obligatoria cuando porcentaje=false');
      }
      if (referencia.length !== medidas.length) {
        throw new Error('medidas y referencia deben tener la misma longitud');
      }
      const diffs = medidas.map((m, i) => m - referencia[i]);
      uncertainty = Math.abs(this.stats.mean(diffs));
    }

    return { uncertainty, dof: DOF_INF };
  }

  // 6. INCERTIDUMBRE ESTÁNDAR DE LA REFERENCIA
  calcularReferencia(input: ReferenciaInput): UncertaintyOutput {
    const { incertidumbres } = input;
    if (!incertidumbres || incertidumbres.length === 0) {
      throw new Error('incertidumbres no puede estar vacío');
    }
    const uncertainty = incertidumbres[incertidumbres.length - 1] / 2;
    return { uncertainty, dof: DOF_INF };
  }
}
