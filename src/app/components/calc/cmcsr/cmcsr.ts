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
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CmcPayload, CmcResultado, CmcMultiPayload } from '../../../models/cmc.model';
import { CmcData } from '../../../models/cmc.model';
import {
  CmcCalculatorService,
  CmcVistaResultado,
  ResumenTablaCmc
} from '../../../services/calc/cmc-calculator.service';
import { CmcService } from '../../../services/database/cmc.service';
import { AlertService } from '../../../services/core/alert.service';
import { AuthService } from '../../../services/auth/auth.service';

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

  private auth = inject(AuthService);

  @Input() cmcs: CmcPayload[] = [];
  @Input() titulo = '';
  @Input() mostrarEncabezado = true;

  @Output() calculado = new EventEmitter<CmcResultado[]>();
  @Output() cerrado = new EventEmitter<void>();

  resultados: CmcVistaResultado[] = [];
  cmcActivoId: number | null = null;
  copiado = false;

  /** Bandera: petición de guardado (individual o masivo) en curso */
  guardando = false;

  /** Números de CMC guardados exitosamente — persiste entre cambios de CMC */
  private guardadosExitosos = new Set<number>();

  /** Resúmenes crudos que llegan desde el router state */
  resumenTablas: Record<number, ResumenTablaCmc[]> = {};

  private readonly calc = inject(CmcCalculatorService);
  private readonly cmcService = inject(CmcService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly location = inject(Location);

  constructor(private router: Router){ }

  // -------------------------------------------------------------------
  // Getters usados por el template
  // -------------------------------------------------------------------
  get cmcActivo(): CmcVistaResultado | undefined {
    return this.resultados.find(r => r.payload.cmcNumero === this.cmcActivoId);
  }

  /** ¿El CMC activo ya fue guardado? */
  get guardadoExitoso(): boolean {
    return this.cmcActivoId !== null && this.guardadosExitosos.has(this.cmcActivoId);
  }

  /** ¿Hay más de un CMC en pantalla? */
  get tieneMultiples(): boolean {
    return this.resultados.length > 1;
  }

  /** ¿Queda alguno pendiente de guardar? */
  get puedeGuardarTodos(): boolean {
    if (this.guardando) return false;
    return this.resultados.some(
      r => !!r.resultado && !this.guardadosExitosos.has(r.payload.cmcNumero)
    );
  }

  get todosGuardados(): boolean {
    if (!this.resultados.length) return false;
    return this.resultados.every(r => this.guardadosExitosos.has(r.payload.cmcNumero));
  }

  get puedeGuardar(): boolean {
    return !this.guardando && !this.guardadoExitoso && !!this.cmcActivo?.resultado;
  }

  get textoBotonGuardar(): string {
    if (this.guardando) return 'Guardando…';
    if (this.guardadoExitoso) return 'CMC Guardado con éxito';
    return 'Guardar CMC';
  }

  get textoBotonGuardarTodos(): string {
    if (this.guardando) return 'Guardando…';
    if (this.todosGuardados) return 'Todos guardados';
    return 'Guardar todos los CMC';
  }

  /** Helper público para el template (indicador en tabs) */
  estaGuardado(id: number): boolean {
    return this.guardadosExitosos.has(id);
  }

  // -------------------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------------------
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cmcs'] && !changes['cmcs'].isFirstChange()) {
      // Nueva entrada de cálculos → reseteamos el estado de guardado
      this.guardadosExitosos.clear();
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
    // No se resetea el estado: cada CMC conserva su marca de "guardado" en el Set
    this.refresh();
  }

  // -------------------------------------------------------------------
  // Guardado INDIVIDUAL (CMC activo) — sin confirmación
  // -------------------------------------------------------------------
  guardarResultados(): void {
    const user = this.auth.getUser()?.id_user;
    if (!user) {
      this.alert.error('Debes iniciar sesión para guardar el cálculo.', 'Sesión requerida');
      return;
    }

    if (this.guardadoExitoso || this.guardando) return;

    const activo = this.cmcActivo;
    if (!activo || !activo.resultado) {
      this.alert.warning('No hay un CMC válido seleccionado para guardar.', 'Sin datos');
      return;
    }

    this.guardando = true;
    this.refresh();

    const dataAGuardar = this.buildCmcData(activo, user);

    this.cmcService.crearCmc(dataAGuardar).subscribe({
      next: (resp) => {
        this.guardando = false;

        if (resp.ok) {
          this.guardadosExitosos.add(activo.payload.cmcNumero);
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

  // -------------------------------------------------------------------
  // Guardado MASIVO — con confirmación vía AlertService
  // -------------------------------------------------------------------
  async guardarTodosLosCmc(): Promise<void> {
    const user = this.auth.getUser()?.id_user;
    if (!user) {
      this.alert.error('Debes iniciar sesión para guardar los cálculos.', 'Sesión requerida');
      return;
    }

    if (this.guardando) return;

    const pendientes = this.resultados.filter(
      r => !!r.resultado && !this.guardadosExitosos.has(r.payload.cmcNumero)
    );

    if (!pendientes.length) {
      this.alert.warning('Todos los CMC ya están guardados.', 'Sin cambios');
      return;
    }

    // Confirmación SOLO si hay más de un CMC en total
    if (this.resultados.length > 1) {
      const lista = pendientes.map(p => `#${p.payload.cmcNumero}`).join(', ');
      const ok = await this.alert.confirm(        // ← AJUSTA AQUÍ si tu API es distinta
        `Se guardarán ${pendientes.length} CMC (${lista}). ¿Deseas continuar?`,
        'Confirmar guardado'
      );
      if (!ok) return;
    }

    this.guardando = true;
    this.refresh();

    let exitos = 0;
    let fallidos = 0;

    for (const item of pendientes) {
      try {
        const data = this.buildCmcData(item, user);
        const resp = await firstValueFrom(this.cmcService.crearCmc(data));

        if (resp?.ok) {
          this.guardadosExitosos.add(item.payload.cmcNumero);
          exitos++;
        } else {
          fallidos++;
          console.warn(`[Cmcsr] CMC #${item.payload.cmcNumero} no se guardó (resp.ok=false).`);
        }
      } catch (err) {
        fallidos++;
        console.error(`[Cmcsr] Error guardando CMC #${item.payload.cmcNumero}:`, err);
      }
      this.refresh();
    }

    this.guardando = false;

    if (fallidos === 0) {
      this.alert.success(`Se guardaron ${exitos} CMC correctamente.`, 'Guardado exitoso');
    } else if (exitos === 0) {
      this.alert.error(`No se pudo guardar ningún CMC (${fallidos} fallidos).`, 'Error al guardar');
    } else {
      this.alert.warning(
        `Se guardaron ${exitos} CMC. ${fallidos} fallidos. Revisa la consola.`,
        'Guardado parcial'
      );
    }

    this.refresh();
  }

  /** Construye el CmcData a partir del view-model + usuario */
  private buildCmcData(item: CmcVistaResultado, user: string): CmcData {
    const payload = item.payload;
    const res = item.resultado!;
    return {
      id_equipment: payload.id,
      id_user: user,
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
      reproducibility: res.reproducibilidad,
    };
  }

  // -------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------
  fmt(n: number | null | undefined, digitos = 6): string {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return n.toFixed(digitos);
  }

  fmtPct(n: number): string {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return `${n.toFixed(2)} %`;
  }

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

  verCmc(): void {
    this.router.navigate(['/cmc-list']);
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
