import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CmcPayload, CmcResultado, CmcMultiPayload } from '../../../models/cmc.model';
import { CmcCalculatorService } from '../../../services/cmc-calculator.service';
import { AlertService } from '../../../services/alert.service';

interface CmcCalculado {
  payload: CmcPayload;
  resultado: CmcResultado;
  error?: string;
}

/**
 * Estructura recibida desde cmcparamsvf.ts con los datos de la tabla
 * "Valores seleccionados del CMC".
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

interface EstadoNavegacionCmc {
  payload?: CmcMultiPayload;
  equipmentId?: string;
  mensurando?: string;
  resumenTablas?: Record<number, ResumenTablaCmc[]>;
}

@Component({
  selector: 'app-cmcsr',
  imports: [CommonModule, FormsModule],
  templateUrl: './cmcsr.html',
  styleUrl: './cmcsr.css',
})
export class Cmcsr implements OnChanges, OnInit {

  /** Puede recibir uno o varios CMC. */
  @Input() cmcs: CmcPayload[] = [];
  @Input() titulo = '';
  @Input() mostrarEncabezado = true;

  @Output() calculado = new EventEmitter<CmcResultado[]>();
  @Output() cerrado = new EventEmitter<void>();

  resultados: CmcCalculado[] = [];
  cmcActivoId: number | null = null;
  copiado = false;

  /** Guarda los resúmenes de tablas enviados desde el configurador */
  resumenTablas: Record<number, ResumenTablaCmc[]> = {};

  private readonly calc = inject(CmcCalculatorService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly location = inject(Location);

  get cmcActivo(): CmcCalculado | undefined {
    return this.resultados.find(r => r.payload.cmcNumero === this.cmcActivoId);
  }

  /** Obtiene la tabla resumen del CMC que está activo en este momento */
  get resumenActivo(): ResumenTablaCmc[] {
    if (this.cmcActivoId === null) return [];
    return this.resumenTablas[this.cmcActivoId] ?? [];
  }

  // ============================================================
  //   CICLO DE VIDA
  // ============================================================

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cmcs'] && !changes['cmcs'].isFirstChange()) {
      this.recalcular();
    }

    if (changes['titulo'] && !changes['titulo'].isFirstChange()) {
      this.refresh();
    }
  }

  ngOnInit(): void {
    // 1) Fallback: leer del router state si no hay input
    if (!this.cmcs?.length) {
      const state = (this.location.getState() ?? {}) as EstadoNavegacionCmc;

      if (state.payload?.cmcs?.length) {
        this.cmcs = state.payload.cmcs;
        if (!this.titulo) {
          this.titulo = state.mensurando ?? '';
        }
        // Extraemos el resumen de las tablas enviado desde el configurador
        if (state.resumenTablas) {
          this.resumenTablas = state.resumenTablas;
        }

        console.log(
          '[Cmcsr] CMCs cargados desde el router state:',
          this.cmcs.length,
          this.cmcs
        );
        console.log(
          '[Cmcsr] Resumen de tablas cargado:',
          this.resumenTablas
        );
      } else {
        console.warn(
          '[Cmcsr] No se recibieron CMCs ni por @Input ni por router state.',
          state
        );
      }
    }

    // 2) Calcular si hay algo que calcular
    if (this.cmcs?.length) {
      this.recalcular();
    }
  }

  // ============================================================
  //   CÁLCULO
  // ============================================================

  recalcular(): void {
    this.resultados = (this.cmcs ?? []).map(payload => {
      try {
        return { payload, resultado: this.calc.calcular(payload) };
      } catch (e: any) {
        console.error(
          `[Cmcsr] Error al calcular CMC #${payload?.cmcNumero}:`,
          e
        );
        return {
          payload,
          resultado: null as any,
          error: e?.message ?? 'Error desconocido',
        };
      }
    });

    // Diagnóstico: si hay errores, avisamos al usuario
    const errores = this.resultados.filter(r => !!r.error);
    if (errores.length) {
      console.error('[Cmcsr] Errores al calcular CMC:', errores);
      this.alert.warning(
        `No se pudieron calcular ${errores.length} CMC. Detalle en consola.`,
        'Errores en el cálculo'
      );
    }

    // Mantener el CMC activo si sigue existiendo; si no, tomar el primero
    if (this.resultados.length) {
      const actual = this.resultados.find(
        r => r.payload.cmcNumero === this.cmcActivoId
      );
      this.cmcActivoId = actual
        ? actual.payload.cmcNumero
        : this.resultados[0].payload.cmcNumero;
    } else {
      this.cmcActivoId = null;
    }

    // Notificar al padre (si alguien escucha)
    this.calculado.emit(
      this.resultados.filter(r => !!r.resultado).map(r => r.resultado)
    );

    this.refresh();
  }

  seleccionarCmc(id: number): void {
    this.cmcActivoId = id;
    this.refresh();
  }

  // ============================================================
  //   FORMATEO
  // ============================================================

  fmt(n: number | null | undefined, digitos = 6): string {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return n.toFixed(digitos);
  }

  fmtPct(n: number): string {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return `${n.toFixed(2)} %`;
  }

  // ============================================================
  //   COPIAR / EXPORTAR
  // ============================================================

  copiarResultados(): void {
    const texto = this.resultados
      .filter(r => !!r.resultado)
      .map(r => this.formatearTexto(r))
      .join('\n\n');

    if (!texto) return;

    navigator.clipboard.writeText(texto).then(() => {
      this.copiado = true;
      this.alert.success('Resultados copiados al portapapeles.', 'Copiado');
      setTimeout(() => {
        this.copiado = false;
        this.refresh();
      }, 2000);
    });
  }

  exportarCsv(): void {
    const filas: string[] = [
      'CMC,Rango,Estabilidad,Sesgo,Deriva,IncertRef,EstabRef,Repetibilidad,Reproducibilidad,u_c,dof_eff,k,U,U_expandida',
    ];
    for (const r of this.resultados) {
      if (!r.resultado) continue;
      const x = r.resultado;
      filas.push(
        [
          x.cmcNumero,
          `"${x.rangoReferencia}"`,
          x.estabilidad,
          x.sesgo,
          x.deriva,
          x.incertRefEstandar,
          x.estabilidadRefEstandar,
          x.repetibilidad,
          x.reproducibilidad,
          x.incertidumbreCombinada,
          x.dofEfectivos,
          x.coefExpansion,
          x.incertidumbreExpandida,
        ].join(',')
      );
    }
    const blob = new Blob([filas.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CMC_${this.titulo || 'resultado'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private formatearTexto(r: CmcCalculado): string {
    if (!r.resultado) return '';
    const x = r.resultado;
    return [
      `# === CMC #${x.cmcNumero} — ${x.rangoReferencia} ===`,
      `Certificados: ${x.certificados.join(', ')}`,
      `Estabilidad:                 ${this.fmt(x.estabilidad)}`,
      `Sesgo (BIAS):                ${this.fmt(x.sesgo)}`,
      `Deriva (Drift):              ${this.fmt(x.deriva)}`,
      `Incert. ref. (u/2):          ${this.fmt(x.incertRefEstandar)}`,
      `Estabilidad ref.:            ${this.fmt(x.estabilidadRefEstandar)}`,
      `Repetibilidad:               ${this.fmt(x.repetibilidad)}`,
      `Reproducibilidad:            ${this.fmt(x.reproducibilidad)}`,
      `u combinada:                 ${this.fmt(x.incertidumbreCombinada)}`,
      `Grados de libertad efectivos:${x.dofEfectivos}`,
      `Coef. expansión (k):         ${this.fmt(x.coefExpansion, 4)}`,
      `U expandida (k·u_c):         ${this.fmt(x.incertidumbreExpandida)}`,
    ].join('\n');
  }

  // ============================================================
  //   CIERRE / UTILIDADES
  // ============================================================

  cerrar(): void {
    this.cerrado.emit();
  }

  volver(): void {
    this.location.back();
  }

  private refresh(): void {
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }
}
