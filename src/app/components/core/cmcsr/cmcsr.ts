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
import { CmcData } from '../../../models/cmc.model';
import {
  CmcCalculatorService,
  CmcVistaResultado,
  ResumenTablaCmc
} from '../../../services/calc/cmc-calculator.service';
import { CmcService } from '../../../services/database/cmc.service';
import { AlertService } from '../../../services/core/alert.service';

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

  @Input() cmcs: CmcPayload[] = [];
  @Input() titulo = '';
  @Input() mostrarEncabezado = true;

  @Output() calculado = new EventEmitter<CmcResultado[]>();
  @Output() cerrado = new EventEmitter<void>();

  /** El ViewModel ahora viene unificado desde el servicio */
  resultados: CmcVistaResultado[] = [];
  cmcActivoId: number | null = null;
  copiado = false;

  /** Bandera: hay una petición de guardado en curso */
  guardando = false;

  /** Bandera: el CMC activo ya fue guardado exitosamente (bloquea el botón) */
  guardadoExitoso = false;

  /** Guarda los resúmenes crudos del router state */
  resumenTablas: Record<number, ResumenTablaCmc[]> = {};

  private readonly calc = inject(CmcCalculatorService);
  private readonly cmcService = inject(CmcService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly location = inject(Location);

  get cmcActivo(): CmcVistaResultado | undefined {
    return this.resultados.find(r => r.payload.cmcNumero === this.cmcActivoId);
  }

  /** ¿Se puede pulsar el botón de guardar? */
  get puedeGuardar(): boolean {
    return !this.guardando && !this.guardadoExitoso && !!this.cmcActivo?.resultado;
  }

  /** Texto dinámico del botón (útil para el template) */
  get textoBotonGuardar(): string {
    if (this.guardando) return 'Guardando…';
    if (this.guardadoExitoso) return 'Guardado';
    return 'Guardar CMC';
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
    if (!this.cmcs?.length) {
      const state = (this.location.getState() ?? {}) as EstadoNavegacionCmc;

      if (state.payload?.cmcs?.length) {
        this.cmcs = state.payload.cmcs;
        if (!this.titulo) this.titulo = state.mensurando ?? '';
        if (state.resumenTablas) this.resumenTablas = state.resumenTablas;
      }
    }

    if (this.cmcs?.length) {
      this.recalcular();
    }
  }

  // ============================================================
  //   DELEGACIÓN AL SERVICIO
  // ============================================================

  recalcular(): void {
    this.resultados = this.calc.procesarResultados(this.cmcs, this.resumenTablas);

    const errores = this.resultados.filter(r => !!r.error);
    if (errores.length) {
      this.alert.warning(
        `No se pudieron calcular ${errores.length} CMC. Detalle en consola.`,
        'Errores en el cálculo'
      );
    }

    if (this.resultados.length) {
      const actual = this.resultados.find(r => r.payload.cmcNumero === this.cmcActivoId);
      this.cmcActivoId = actual ? actual.payload.cmcNumero : this.resultados[0].payload.cmcNumero;
    } else {
      this.cmcActivoId = null;
    }

    this.calculado.emit(
      this.resultados.filter(r => !!r.resultado).map(r => r.resultado as CmcResultado)
    );

    this.refresh();
  }

  seleccionarCmc(id: number): void {
    this.cmcActivoId = id;
    // Si el usuario cambia de CMC, permitimos intentar guardar el nuevo
    // (si prefieres bloqueo total, elimina esta línea).
    this.guardadoExitoso = false;
    this.refresh();
  }

  // ============================================================
  //   GUARDAR EN BASE DE DATOS (solo el CMC activo)
  // ============================================================

  /**
   * Guarda **únicamente** el CMC activo.
   * - Si ya se guardó con éxito, el botón queda bloqueado (`guardadoExitoso = true`).
   * - Mientras la petición está en vuelo, `guardando = true` (spinner).
   */
  guardarResultados(): void {
    // Bloqueo total tras un guardado exitoso
    if (this.guardadoExitoso || this.guardando) return;

    const activo = this.cmcActivo;

    if (!activo || !activo.resultado) {
      this.alert.warning('No hay un CMC válido seleccionado para guardar.', 'Sin datos');
      return;
    }

    this.guardando = true;
    this.refresh();

    const payload = activo.payload;
    const res = activo.resultado;

    const dataAGuardar: CmcData = {
      name_equipment: payload.id, // ID del equipo
      value_ref_min: payload.minReferencia || payload.rangoReferencia,
      value_ref_max: payload.maxReferencia || payload.rangoReferencia,
      interval_value: payload.rangoReferencia,
      cert_associate: res.certificados.join(', '),

      u_combined: res.incertidumbreCombinada,
      degrees_freedom: res.dofEfectivos,
      coefficient_expansion: res.coefExpansion,
      u_expanded: res.incertidumbreExpandida,

      stability: res.estabilidad,
      bias: res.sesgo,
      drift: res.deriva,
      u_reference: res.incertRefEstandar,
      s_reference: res.estabilidadRefEstandar,
      repeatability: res.repetibilidad,
      reproducibility: res.reproducibilidad
    };

    this.cmcService.crearCmc(dataAGuardar).subscribe({
      next: (resp) => {
        this.guardando = false;

        if (resp.ok) {
          this.guardadoExitoso = true;
          this.alert.success('El CMC se guardó correctamente.', 'Guardado exitoso');
        } else {
          this.alert.warning('No se pudo guardar el CMC. Revisa la consola.', 'Guardado fallido');
        }

        this.refresh();
      },
      error: (err) => {
        this.guardando = false;
        console.error('[Cmcsr] Error al guardar CMC:', err);
        this.alert.error('Ocurrió un error de red al intentar guardar el CMC.', 'Error al guardar');
        this.refresh();
      }
    });
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
    const blob = new Blob([filas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CMC_${this.titulo || 'resultado'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private formatearTexto(r: CmcVistaResultado): string {
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
