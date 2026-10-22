//El componente actual se mantiene igual, este componente es una primera version de cmcparams, se calcula solo un registro de las tablas, donde se toma la incertidumbre error y datos de
import {
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { CertService } from '../../../services/database/cert.service';
import { AlertService } from '../../../services/core/alert.service';
import { ApiResponse, Column, ResultTable } from '../../../models/certificado.models';
import { Cmcsr } from '../../calc/cmcsr/cmcsr';

export interface CmcTablaSeleccion {
  seleccionada: boolean;
  filaIndex: number;
  columnaErrorKey: string;
  columnaIncertidumbreKey: string;
}

export interface CmcFilaDetalle {
  cc: string;
  table_id: string;
  fechaCalibracion: string;
  diasDesdeAnterior: number | null;
  error: number;
  incertidumbre: number;
  rango: string;
  nRegistros?: number;
}

export interface CmcPayload {
  id: string;
  cmcNumero: number;
  errores: number[];
  incertidumbres: number[];
  tiempoIntermedio: number[];
  intervaloCalibracion: number;
  fechasCalibracion: string[];
  certificados: string[];
  rangoReferencia: string;
  detalle: CmcFilaDetalle[];
  minReferencia?: string;
  maxReferencia?: string;
  nRegistrosPorCertificado?: number[];
}

export interface CmcMultiPayload {
  cmcs: CmcPayload[];
}

export interface CmcConfiguracion {
  id: number;
  intervaloCalibracion: number;
  selecciones: Record<number, CmcTablaSeleccion>;
  payload: CmcPayload | null;
  payloadTexto: string;
}

export interface CmcFuenteIncertidumbre {
  clave: string;
  nombre: string;
  valor: number;
  dof: number;
  pesoPct: number;
}

export interface CmcResultado {
  estabilidad: number;
  sesgo: number;
  deriva: number;
  incertRefEstandar: number;
  estabilidadRefEstandar: number;
  repetibilidad: number;
  reproducibilidad: number;
  incertidumbreCombinada: number;
  dofEfectivos: number;
  coefExpansion: number;
  incertidumbreExpandida: number;
  fuentes: CmcFuenteIncertidumbre[];
  cmcNumero: number;
  rangoReferencia: string;
  certificados: string[];
  minReferencia?: string;
  maxReferencia?: string;
  nRegistrosPorCertificado?: number[];
}

@Component({
  selector: 'app-cmcparams',
  standalone: true,
  imports: [FormsModule, CommonModule, Cmcsr],
  templateUrl: './cmcparams.html',
  styleUrl: './cmcparams.css',
})
export class Cmcparams implements OnInit {

  equipmentIds: string[] = [];
  selectedEquipmentId = '';

  tablas: ResultTable[] = [];
  filteredTablas: ResultTable[] = [];

  availableTitles: string[] = [];
  availableParameters: string[] = [];

  selectedTitle = '';
  selectedParameter = '';

  cargando = false;

  certificadosEnProceso = false;
  certificadosPorCc: Record<string, any> = {};

  mostrarPanelCmc = false;
  panelCmcColapsado = false;

  cmcs: CmcConfiguracion[] = [];
  cmcActivoId = 1;

  copiadoCmc = false;

  mostrarResultadosCmc = false;
  resultadosCmc: CmcResultado[] = [];

  /** Caché para el binding [cmcs] del hijo. */
  private _cmcsParaMostrarCache: CmcPayload[] = [];
  private _claveCacheCmcs = '';

  private readonly paletaCmc: { bg: string; border: string; badge: string }[] = [
    { bg: 'rgba(13, 110, 253, 0.10)', border: '#0d6efd', badge: '#0d6efd' },
    { bg: 'rgba(25, 135, 84, 0.10)',  border: '#198754', badge: '#198754' },
    { bg: 'rgba(255, 193, 7, 0.15)',  border: '#ffc107', badge: '#ffc107' },
    { bg: 'rgba(220, 53, 69, 0.10)',  border: '#dc3545', badge: '#dc3545' },
    { bg: 'rgba(111, 66, 193, 0.10)', border: '#6f42c1', badge: '#6f42c1' },
    { bg: 'rgba(13, 202, 240, 0.10)', border: '#0dcaf0', badge: '#0dcaf0' },
    { bg: 'rgba(253, 126, 20, 0.10)', border: '#fd7e14', badge: '#fd7e14' },
    { bg: 'rgba(214, 51, 132, 0.10)', border: '#d63384', badge: '#d63384' },
  ];

  private readonly opcionesParametroPorTitulo: Record<string, string[]> = {
    'DC Voltage': ['Voltage'],
    'AC Voltage': ['RMS Voltage', 'Peak-to-Peak Voltage (PP)'],
    'DC Current': ['Current'],
    'AC Current': ['RMS Current', 'Peak-to-Peak Current (PP)'],
    'Resistance': ['Resistance'],
    '4-Wire Resistance': ['4-Wire Resistance'],
    'Lightning Impulse Voltage (LI)': [
      'LI Impulse Voltage',
      'Determination of scale factor and measurement of Ut',
      'Measurement of front time T1',
      'Measurement of time to half value T2',
      'Polarity Linearity Test'
    ],
    'Switching Impulse Voltage (SI)': [
      'LI Impulse Voltage',
      'Determination of scale factor and measurement of Ut',
      'Measurement of front time T1',
      'Measurement of time to half value T2',
      'Polarity Linearity Test'
    ],
    'Frequency': ['Frequency'],
    'Capacitance': ['Capacitance'],
    'Other': []
  };

  private readonly titulosConocidos = new Set(
    Object.keys(this.opcionesParametroPorTitulo).filter(t => t !== 'Other')
  );

  constructor(
    private readonly cert: CertService,
    private readonly alert: AlertService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarEquipos();
  }

  get cmcActivo(): CmcConfiguracion | undefined {
    return this.cmcs.find(c => c.id === this.cmcActivoId);
  }

  get seleccionCmc(): Record<number, CmcTablaSeleccion> {
    return this.cmcActivo?.selecciones ?? {};
  }

  get cmcsParaMostrar(): CmcPayload[] {
    const clave = this.cmcs
      .filter(c => c.payload !== null)
      .map(c => c.id)
      .join('|');

    if (clave !== this._claveCacheCmcs) {
      this._claveCacheCmcs = clave;
      this._cmcsParaMostrarCache = this.cmcs
        .filter(c => c.payload !== null)
        .map(c => c.payload as CmcPayload);
    }

    return this._cmcsParaMostrarCache;
  }

  get payloadCompleto(): CmcMultiPayload {
    return { cmcs: this.cmcsParaMostrar };
  }

  get textoPayloadCompleto(): string {
    const partes = this.cmcs
      .filter(c => c.payloadTexto)
      .map(c => c.payloadTexto);
    return partes.length ? partes.join('\n\n') : '';
  }

  get cmcActivoTieneErrores(): boolean {
    return Object.keys(this.seleccionCmc).some(idx => {
      const i = Number(idx);
      return this.tieneErrorInvalido(i) || this.tieneIncertidumbreInvalida(i);
    });
  }

  get hayCmcCalculados(): boolean {
    return this.cmcs.some(c => c.payload !== null);
  }

  get etiquetaMensurando(): string {
    if (!this.selectedTitle) return '';
    return this.selectedParameter
      ? `${this.selectedTitle} — ${this.selectedParameter}`
      : this.selectedTitle;
  }

  formatColumnLabel(col: Column | undefined): string {
    if (!col) return '';
    const label = col.label || col.key || '';
    const unit = (col as any)?.unit;
    const unitStr = unit === null || unit === undefined ? '' : String(unit).trim();
    if (!unitStr || unitStr.toUpperCase() === 'N/A') return label;
    return `${label} (${unitStr})`;
  }

  esNumeroValido(val: any): boolean {
    if (val === null || val === undefined) return true;
    const s = String(val).trim();
    if (s === '') return true;
    return /^-?(?:\d+[.,]?\d*|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(s);
  }

  tieneErrorInvalido(index: number): boolean {
    const sel = this.seleccionCmc[index];
    if (!sel || !sel.seleccionada) return false;
    const tabla = this.filteredTablas[index];
    if (!tabla) return false;
    const val = this.getValorCelda(tabla, sel.filaIndex, sel.columnaErrorKey);
    if (val === null || val === undefined || String(val).trim() === '') return false;
    return !this.esNumeroValido(val);
  }

  tieneIncertidumbreInvalida(index: number): boolean {
    const sel = this.seleccionCmc[index];
    if (!sel || !sel.seleccionada) return false;
    const tabla = this.filteredTablas[index];
    if (!tabla) return false;
    const val = this.getValorCelda(tabla, sel.filaIndex, sel.columnaIncertidumbreKey);
    if (val === null || val === undefined || String(val).trim() === '') return false;
    return !this.esNumeroValido(val);
  }

  private cargarEquipos(): void {
    this.cert.obtenerEquipmentId().subscribe({
      next: (response: ApiResponse<string[]>) => {
        if (response.ok) {
          this.equipmentIds = response.data ?? [];
        } else {
          this.alert.error(response.message ?? 'No se pudieron obtener los equipos');
        }
        this.refresh();
      },
      error: (err) => {
        console.error(err);
        this.alert.error('Error de red al obtener los equipos');
        this.refresh();
      }
    });
  }

  onEquipmentChange(): void {
    this.selectedTitle = '';
    this.selectedParameter = '';
    this.tablas = [];
    this.filteredTablas = [];
    this.availableTitles = [];
    this.availableParameters = [];
    this.certificadosPorCc = {};
    this.certificadosEnProceso = false;
    this.cerrarPanelCmc();
    this.cerrarResultadosCmc();

    if (!this.selectedEquipmentId) {
      this.refresh();
      return;
    }

    this.cargando = true;
    this.refresh();

    this.cert.obtenerTablas(this.selectedEquipmentId)
      .pipe(
        finalize(() => {
          this.cargando = false;
          this.refresh();
        })
      )
      .subscribe({
        next: (response: ApiResponse<ResultTable[]>) => {
          if (response.ok && response.data?.length) {
            this.tablas = response.data;
            this.filteredTablas = [...this.tablas];
            this.construirTitulos();

            this.alert.success(
              `Se cargaron ${this.tablas.length} tabla${this.tablas.length === 1 ? '' : 's'} del equipo ${this.selectedEquipmentId}.`,
              'Tablas cargadas'
            );
          } else {
            this.alert.info(
              response.message ?? `El equipo ${this.selectedEquipmentId} no tiene tablas asociadas.`,
              'Sin datos'
            );
          }
        },
        error: (err) => {
          console.error(err);
          this.alert.error(
            err?.error?.message ?? 'Error al obtener las tablas del equipo',
            'Error de conexión'
          );
        }
      });
  }

  private construirTitulos(): void {
    const titulosPresentes = new Set(this.tablas.map(t => t.title));

    const conocidos = Array.from(titulosPresentes)
      .filter(t => this.titulosConocidos.has(t))
      .sort();

    const hayDesconocidos = Array.from(titulosPresentes)
      .some(t => !this.titulosConocidos.has(t));

    this.availableTitles = hayDesconocidos ? [...conocidos, 'Other'] : conocidos;
  }

  private calcularParametros(titulo: string): string[] {
    if (!titulo) return [];

    if (titulo === 'Other') {
      const params = new Set<string>();
      this.tablas
        .filter(t => !this.titulosConocidos.has(t.title))
        .forEach(t => params.add(t.parameter));
      return Array.from(params).sort();
    }

    const esperados = this.opcionesParametroPorTitulo[titulo] ?? [];
    const presentes = new Set(
      this.tablas.filter(t => t.title === titulo).map(t => t.parameter)
    );

    const coincidentes = esperados.filter(p => presentes.has(p));
    const extras = Array.from(presentes).filter(p => !esperados.includes(p));

    return extras.length ? [...coincidentes, 'Other'] : coincidentes;
  }

  onTitleChange(): void {
    this.selectedParameter = '';
    this.availableParameters = this.calcularParametros(this.selectedTitle);
    this.aplicarFiltros();
    this.cerrarResultadosCmc();
  }

  onParameterChange(): void {
    this.aplicarFiltros();
    this.cerrarResultadosCmc();
  }

  private aplicarFiltros(): void {
    this.filteredTablas = this.tablas.filter(t => {
      if (this.selectedTitle === 'Other') {
        if (this.titulosConocidos.has(t.title)) return false;
      } else if (this.selectedTitle) {
        if (t.title !== this.selectedTitle) return false;
      }

      if (this.selectedParameter === 'Other') {
        if (this.selectedTitle !== 'Other') {
          const esperados = this.opcionesParametroPorTitulo[this.selectedTitle] ?? [];
          if (esperados.includes(t.parameter)) return false;
        }
      } else if (this.selectedParameter) {
        if (t.parameter !== this.selectedParameter) return false;
      }

      return true;
    });

    if (this.selectedTitle) {
      this.cargarCertificadosDeTablas();
    } else {
      this.certificadosEnProceso = false;
      this.certificadosPorCc = {};
      this.refresh();
    }
  }

  private cargarCertificadosDeTablas(): void {
    if (!this.selectedTitle) return;

    const ccs = Array.from(
      new Set(
        this.filteredTablas
          .map(t => t.cc_id)
          .filter((cc): cc is string => !!cc)
      )
    );

    const pendientes = ccs.filter(cc => !(cc in this.certificadosPorCc));

    if (!pendientes.length) {
      this.certificadosEnProceso = false;
      this.refresh();
      return;
    }

    this.certificadosEnProceso = true;
    this.refresh();

    const peticiones$ = pendientes.map(cc =>
      this.cert.obtenerCertificadoCc(cc).pipe(
        catchError(err => {
          console.error(`Error al obtener certificado ${cc}`, err);
          this.alert.error(`Error de red al obtener el certificado ${cc}`);
          return of({ ok: false, data: null });
        })
      )
    );

    forkJoin(peticiones$)
      .pipe(
        finalize(() => {
          this.certificadosEnProceso = false;
          this.refresh();
        })
      )
      .subscribe({
        next: (respuestas) => {
          const nuevosCertificados = { ...this.certificadosPorCc };

          respuestas.forEach((response, index) => {
            const cc = pendientes[index];
            nuevosCertificados[cc] = (response && response.ok && response.data) ? response.data : null;
          });

          this.certificadosPorCc = nuevosCertificados;

          const total = pendientes.length;
          this.alert.success(
            `Se cargaron ${total} certificado${total === 1 ? '' : 's'} asociado${total === 1 ? '' : 's'}.`,
            'Certificados cargados'
          );
        }
      });
  }

  getCertificado(tabla: ResultTable): any {
    const cc = tabla?.cc_id;
    if (!cc) return null;
    return this.certificadosPorCc[cc] ?? null;
  }

  getCellValue(row: Record<string, any>, col: Column): string {
    const v = row?.[col.key];
    if (v === null || v === undefined || v === '') return '—';
    return String(v);
  }

  resetFiltros(): void {
    this.selectedTitle = '';
    this.selectedParameter = '';
    this.availableParameters = [];
    this.filteredTablas = [...this.tablas];
    this.certificadosPorCc = {};
    this.certificadosEnProceso = false;
    this.cerrarPanelCmc();
    this.cerrarResultadosCmc();
    this.refresh();
    this.alert.info('Filtros restablecidos.', 'Sin filtros');
  }

  abrirPanelCmc(): void {
    if (!this.selectedTitle) {
      this.alert.warning('Selecciona un título (mensurando) antes de calcular el CMC.');
      return;
    }
    if (!this.filteredTablas.length) {
      this.alert.warning('No hay tablas filtradas para el título seleccionado.');
      return;
    }

    if (this.cmcs.length === 0) {
      const primera = this.crearCmcConfig(1);
      this.cmcs = [primera];
      this.cmcActivoId = 1;
    }

    this.mostrarPanelCmc = true;
    this.panelCmcColapsado = false;
    this.refresh();
  }

  cerrarPanelCmc(): void {
    this.mostrarPanelCmc = false;
    this.panelCmcColapsado = false;
    this.cmcs = [];
    this.cmcActivoId = 1;
    this.cerrarResultadosCmc();
    this.refresh();
  }

  togglePanelCmc(): void {
    this.panelCmcColapsado = !this.panelCmcColapsado;
    this.refresh();
  }

  private crearCmcConfig(id: number): CmcConfiguracion {
    const selecciones: Record<number, CmcTablaSeleccion> = {};

    this.filteredTablas.forEach((tabla, idx) => {
      const colError = this.detectarColumnaError(tabla);
      const colInc = this.detectarColumnaIncertidumbre(tabla);
      const primeraColKey = tabla.columns[0]?.key ?? '';

      selecciones[idx] = {
        seleccionada: false,
        filaIndex: 0,
        columnaErrorKey: colError?.key ?? primeraColKey,
        columnaIncertidumbreKey: colInc?.key ?? primeraColKey
      };
    });

    return {
      id,
      intervaloCalibracion: 24,
      selecciones,
      payload: null,
      payloadTexto: ''
    };
  }

  nuevoCmc(): void {
    const nextId = this.cmcs.length ? Math.max(...this.cmcs.map(c => c.id)) + 1 : 1;
    this.cmcs.push(this.crearCmcConfig(nextId));
    this.cmcActivoId = nextId;
    this.refresh();
    this.alert.success(
      `Se creó el CMC #${nextId}. Configura las tablas y presiona "Calcular CMC".`,
      'Nuevo CMC'
    );
  }

  seleccionarCmc(id: number): void {
    this.cmcActivoId = id;
    this.refresh();
  }

  eliminarCmc(id: number, event?: Event): void {
    event?.stopPropagation();
    if (this.cmcs.length <= 1) {
      this.alert.warning('Debe existir al menos un cálculo de CMC.');
      return;
    }
    this.cmcs = this.cmcs.filter(c => c.id !== id);
    if (this.cmcActivoId === id) {
      this.cmcActivoId = this.cmcs[0].id;
    }
    if (!this.hayCmcCalculados) {
      this.cerrarResultadosCmc();
    } else {
      this.resultadosCmc = this.resultadosCmc.filter(r => r.cmcNumero !== id);
    }
    this.refresh();
    this.alert.info(`CMC #${id} eliminado.`, 'Eliminado');
  }

  private detectarColumnaError(tabla: ResultTable): Column | undefined {
    return tabla.columns.find(c =>
      /error|err\b|desviaci|sesgo/i.test(c.key) || /error|err\b|desviaci|sesgo/i.test(c.label ?? '')
    );
  }

  private detectarColumnaIncertidumbre(tabla: ResultTable): Column | undefined {
    return tabla.columns.find(c =>
      /incert|uncert|^u(_|$)/i.test(c.key) || /incert|uncert/i.test(c.label ?? '')
    );
  }

  toggleTablaCmc(index: number): void {
    const sel = this.seleccionCmc[index];
    if (!sel) return;
    sel.seleccionada = !sel.seleccionada;
    this.refresh();
  }

  onSelectionChange(): void {
    this.refresh();
  }

  seleccionarTodas(): void {
    Object.values(this.seleccionCmc).forEach(s => (s.seleccionada = true));
    this.refresh();
  }

  deseleccionarTodas(): void {
    Object.values(this.seleccionCmc).forEach(s => (s.seleccionada = false));
    this.refresh();
  }

  sincronizarFilaCmc(): void {
    const primera = Object.values(this.seleccionCmc)[0];
    if (!primera) return;
    const fila = primera.filaIndex;
    Object.values(this.seleccionCmc).forEach(s => (s.filaIndex = fila));
    this.refresh();
    this.alert.info(`Fila ${fila + 1} sincronizada en todas las tablas.`, 'Rango aplicado');
  }


  private getValorCelda(
    tabla: ResultTable | undefined,
    filaIndex: number,
    colKey: string
  ): any {
    if (!tabla) return null;
    const row = tabla.rows?.[filaIndex];
    if (!row) return null;
    const val = row[colKey];
    if (val === null || val === undefined || String(val).trim() === '') return null;
    return val;
  }

  formatearValor(val: any): string {
    if (val === null || val === undefined || String(val).trim() === '') return '—';
    return String(val);
  }

  formatearFecha(fecha: string | Date | null | undefined): string {
    if (!fecha) return 'N/A';
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (isNaN(d.getTime())) return 'N/A';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  getRowDisplayLabel(tabla: ResultTable, row: Record<string, any>): string {
    if (!tabla || !row) return '(sin datos)';

    const firstCol = tabla.columns?.[0];
    const firstColKey = firstCol?.key;

    if (firstColKey) {
      const val = row[firstColKey];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        const unit = (firstCol as any)?.unit;
        const unitStr = unit === null || unit === undefined ? '' : String(unit).trim();
        const sufijo = unitStr && unitStr.toUpperCase() !== 'N/A' ? ` ${unitStr}` : '';
        return `${String(val)}${sufijo}`;
      }
    }

    for (const key of Object.keys(row)) {
      const val = row[key];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        return String(val);
      }
    }

    return '(sin valor)';
  }

  getRangoSeleccionado(index: number): string {
    const sel = this.seleccionCmc[index];
    if (!sel) return '';
    const tabla = this.filteredTablas[index];
    if (!tabla) return '';
    const firstColKey = tabla.columns[0]?.key ?? '';
    return this.formatearValor(this.getValorCelda(tabla, sel.filaIndex, firstColKey));
  }

  getErrorSeleccionado(index: number): string {
    const sel = this.seleccionCmc[index];
    if (!sel) return '';
    return this.formatearValor(
      this.getValorCelda(this.filteredTablas[index], sel.filaIndex, sel.columnaErrorKey)
    );
  }

  getIncertidumbreSeleccionada(index: number): string {
    const sel = this.seleccionCmc[index];
    if (!sel) return '';
    return this.formatearValor(
      this.getValorCelda(this.filteredTablas[index], sel.filaIndex, sel.columnaIncertidumbreKey)
    );
  }

  private getColorCmc(id: number): { bg: string; border: string; badge: string } {
    if (id <= 0) return this.paletaCmc[0];
    return this.paletaCmc[(id - 1) % this.paletaCmc.length];
  }

  getCmcsDeFila(tableIndex: number, rowIndex: number): number[] {
    const ids: number[] = [];
    for (const cmc of this.cmcs) {
      const sel = cmc.selecciones[tableIndex];
      if (sel?.seleccionada && sel.filaIndex === rowIndex) {
        ids.push(cmc.id);
      }
    }
    return ids;
  }

  /**
   * En esta versión (una sola fila por CMC), cada fila seleccionada
   * es "la primera del rango". Se mantiene el helper para compatibilidad
   * con el HTML compartido.
   */
  esPrimeraFilaDelRango(tableIndex: number, rowIndex: number, cmcId: number): boolean {
    const cmc = this.cmcs.find(c => c.id === cmcId);
    if (!cmc) return false;
    const sel = cmc.selecciones[tableIndex];
    if (!sel?.seleccionada) return false;
    return sel.filaIndex === rowIndex;
  }

  getCellClasses(tableIndex: number, rowIndex: number, colKey: string): Record<string, boolean> {
    const classes: Record<string, boolean> = {};
    const tabla = this.filteredTablas[tableIndex];
    if (!tabla) return classes;

    const cmcsEnFila = this.getCmcsDeFila(tableIndex, rowIndex);
    if (!cmcsEnFila.length) return classes;

    classes['cell-fila-seleccionada'] = true;

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const columnasUsadas = new Set<string>();
    columnasUsadas.add(colIntervaloKey);

    for (const cmcId of cmcsEnFila) {
      const cmc = this.cmcs.find(c => c.id === cmcId);
      if (!cmc) continue;
      const sel = cmc.selecciones[tableIndex];
      if (!sel?.seleccionada) continue;

      if (colKey === colIntervaloKey)              classes['cell-intervalo'] = true;
      if (colKey === sel.columnaErrorKey)          classes['cell-error'] = true;
      if (colKey === sel.columnaIncertidumbreKey)  classes['cell-incertidumbre'] = true;

      columnasUsadas.add(sel.columnaErrorKey);
      columnasUsadas.add(sel.columnaIncertidumbreKey);
    }

    if (!columnasUsadas.has(colKey)) {
      classes['cell-no-usada'] = true;
    }

    return classes;
  }

  getCellStyle(
    tableIndex: number,
    rowIndex: number,
    colKey: string
  ): Record<string, string> {
    const tabla = this.filteredTablas[tableIndex];
    if (!tabla) return {};

    const cmcsEnFila = this.getCmcsDeFila(tableIndex, rowIndex);
    if (!cmcsEnFila.length) return {};

    const cmcPrincipal = Math.min(...cmcsEnFila);
    const color = this.getColorCmc(cmcPrincipal);
    const colIntervaloKey = tabla.columns[0]?.key ?? '';

    for (const cmcId of cmcsEnFila) {
      const cmc = this.cmcs.find(c => c.id === cmcId);
      if (!cmc) continue;
      const sel = cmc.selecciones[tableIndex];
      if (!sel?.seleccionada) continue;

      if (colKey === colIntervaloKey)              return {};
      if (colKey === sel.columnaErrorKey)          return {};
      if (colKey === sel.columnaIncertidumbreKey)  return {};
    }

    return { 'background-color': color.bg };
  }

  getBadgeStyle(cmcId: number): Record<string, string> {
    const color = this.getColorCmc(cmcId);
    return {
      'background-color': color.badge,
      'color': '#fff'
    };
  }

  estaEnModoCmc(tableIndex: number): boolean {
    if (!this.mostrarPanelCmc) return false;
    return this.cmcs.some(c => c.selecciones[tableIndex]?.seleccionada);
  }

  calcularTodosLosCmc(): void {
    if (!this.cmcs.length) {
      this.alert.warning('No hay cálculos de CMC creados.');
      return;
    }

    const exitosos: number[] = [];
    const fallidos: { id: number; motivo: string }[] = [];

    for (const cmc of this.cmcs) {
      const resultado = this.calcularCmcInterno(cmc);
      if (resultado.ok) {
        exitosos.push(cmc.id);
      } else {
        fallidos.push({ id: cmc.id, motivo: resultado.motivo ?? 'Error desconocido' });
      }
    }

    this.refresh();

    if (!fallidos.length) {
      this.alert.success(
        `Se calcularon correctamente ${exitosos.length} CMC${exitosos.length === 1 ? '' : 's'}.`,
        'Cálculo completado'
      );
      return;
    }

    if (!exitosos.length) {
      const hayInvalidos = fallidos.some(f => f.motivo.includes('datos inválidos'));
      this.alert.error(
        hayInvalidos
          ? `No se puede calcular el CMC: los datos ingresados son inválidos. Detalle: ${fallidos.map(f => `CMC #${f.id}: ${f.motivo}`).join(' | ')}`
          : `No se pudo calcular ningún CMC. Detalle: ${fallidos.map(f => `CMC #${f.id}: ${f.motivo}`).join(' | ')}`,
        hayInvalidos ? 'Datos inválidos' : 'Error en todos los CMC'
      );
      return;
    }

    const hayInvalidos = fallidos.some(f => f.motivo.includes('datos inválidos'));
    this.alert.warning(
      `Se calcularon ${exitosos.length} de ${this.cmcs.length} CMC. ` +
      `${hayInvalidos ? 'CMC con datos inválidos → ' : 'Pendientes → '}` +
      `${fallidos.map(f => `#${f.id}: ${f.motivo}`).join(' | ')}.`,
      'Cálculo parcial'
    );
  }

  private calcularCmcInterno(cmc: CmcConfiguracion): { ok: boolean; motivo?: string } {
    const limpiar = () => {
      cmc.payload = null;
      cmc.payloadTexto = '';
    };

    if (!cmc.intervaloCalibracion || cmc.intervaloCalibracion <= 0) {
      limpiar();
      return { ok: false, motivo: 'intervalo de calibración inválido' };
    }

    const entradas = Object.entries(cmc.selecciones)
      .map(([idx, s]) => ({ idx: Number(idx), s }))
      .filter(({ s }) => s.seleccionada);

    if (entradas.length < 2) {
      limpiar();
      return { ok: false, motivo: 'menos de 2 tablas seleccionadas' };
    }

    const filasValidas: {
      idx: number;
      tabla: ResultTable;
      cert: any;
      fecha: Date;
      error: number;
      incertidumbre: number;
      cc: string;
      table_id: string;
      rango: string;
    }[] = [];

    const invalidos: string[] = [];

    for (const { idx, s } of entradas) {
      const tabla = this.filteredTablas[idx];
      const cert = this.getCertificado(tabla);

      if (!cert) {
        invalidos.push(`tabla #${idx + 1}: sin certificado asociado`);
        continue;
      }

      const fechaRaw = cert.date_cal || cert.date_cc;
      const fecha = fechaRaw ? new Date(fechaRaw) : null;
      if (!fecha || isNaN(fecha.getTime())) {
        invalidos.push(`tabla #${idx + 1}: sin fecha de calibración válida`);
        continue;
      }

      const firstColKey = tabla.columns[0]?.key ?? '';
      const rawError = this.getValorCelda(tabla, s.filaIndex, s.columnaErrorKey);
      const rawInc = this.getValorCelda(tabla, s.filaIndex, s.columnaIncertidumbreKey);
      const rango = this.formatearValor(
        this.getValorCelda(tabla, s.filaIndex, firstColKey)
      );

      if (rawError !== null && !this.esNumeroValido(rawError)) {
        invalidos.push(`tabla #${idx + 1} → Error no numérico: "${rawError}"`);
        continue;
      }

      if (rawInc !== null && !this.esNumeroValido(rawInc)) {
        invalidos.push(`tabla #${idx + 1} → Incertidumbre no numérica: "${rawInc}"`);
        continue;
      }

      const error = Number(String(rawError ?? '').replace(',', '.'));
      const incertidumbre = Number(String(rawInc ?? '').replace(',', '.'));

      if (!isFinite(error) || !isFinite(incertidumbre)) {
        invalidos.push(
          `tabla #${idx + 1} → valores no numéricos en la fila/columna seleccionada`
        );
        continue;
      }

      filasValidas.push({
        idx,
        tabla,
        cert,
        fecha,
        error,
        incertidumbre,
        cc: cert.cc || tabla.cc_id || '',
        table_id: tabla.table_id || '',
        rango
      });
    }

    if (invalidos.length) {
      limpiar();
      return { ok: false, motivo: `datos inválidos → ${invalidos.join('; ')}` };
    }

    if (filasValidas.length < 2) {
      limpiar();
      return { ok: false, motivo: 'filas válidas insuficientes (mínimo 2)' };
    }

    filasValidas.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    const errores = filasValidas.map(x => x.error);
    const incertidumbres = filasValidas.map(x => x.incertidumbre);
    const fechasCalibracion = filasValidas.map(x => x.fecha.toISOString());
    const certificados = filasValidas.map(x => x.cc);
    const rangoReferencia = filasValidas[0].rango;

    const tiempoIntermedio: number[] = [];
    const detalle: CmcFilaDetalle[] = [];

    filasValidas.forEach((x, i) => {
      let dias: number | null = null;
      if (i > 0) {
        const ms = x.fecha.getTime() - filasValidas[i - 1].fecha.getTime();
        dias = Math.round(ms / (1000 * 60 * 60 * 24));
        tiempoIntermedio.push(dias);
      }
      detalle.push({
        cc: x.cc,
        table_id: x.table_id,
        fechaCalibracion: x.fecha.toISOString(),
        diasDesdeAnterior: dias,
        error: x.error,
        incertidumbre: x.incertidumbre,
        rango: x.rango
      });
    });

    const payload: CmcPayload = {
      id: this.selectedEquipmentId,
      cmcNumero: cmc.id,
      errores,
      incertidumbres,
      tiempoIntermedio,
      intervaloCalibracion: cmc.intervaloCalibracion,
      fechasCalibracion,
      certificados,
      rangoReferencia,
      detalle
    };

    cmc.payload = payload;
    cmc.payloadTexto = this.construirTextoPayload(payload);

    return { ok: true };
  }

  private construirTextoPayload(p: CmcPayload): string {
    const fmt = (arr: number[]) => `c(${arr.map(n => n.toString()).join(',')})`;

    return [
      `# === CMC #${p.cmcNumero} ===`,
      `#ID ${p.id}`,
      `#Cálculo de la CMC para un valor de referencia en el intervalo de calibración`,
      ``,
      `#Certificados involucrados: ${p.certificados.join(', ')}`,
      ``,
      `#Entradas:`,
      ``,
      `errores=${fmt(p.errores)} #De los certificados de calibración, desde el más antiguo al más reciente`,
      `incertidumbres=${fmt(p.incertidumbres)} #De los certificados de calibración, desde el más antiguo al más reciente`,
      `tiempo.intermedio=${fmt(p.tiempoIntermedio)} #Días entre calibraciones, desde el más antiguo al más reciente`,
      `intervalo.calibracion=${p.intervaloCalibracion} #Se reporta en meses`
    ].join('\n');
  }

  copiarPayloadCmc(): void {
    const texto = this.textoPayloadCompleto;
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
      this.copiadoCmc = true;
      this.alert.success('Payload copiado al portapapeles.', 'Copiado');
      setTimeout(() => {
        this.copiadoCmc = false;
        this.refresh();
      }, 2000);
    });
  }

  calcularYMostrarCmc(): void {
    try {
      this.calcularTodosLosCmc();
    } catch (e) {
      console.error('[Cmcparams] Excepción en calcularTodosLosCmc:', e);
      this.alert.error('Ocurrió un error inesperado al calcular los CMC. Revisa la consola.', 'Error');
      return;
    }

    const payloads = this.cmcsParaMostrar;

    console.log('[Cmcparams] calcularYMostrarCmc()', {
      totalCmcs: this.cmcs.length,
      payloadsListos: payloads.length,
      detalle: this.cmcs.map(c => ({
        id: c.id,
        tienePayload: c.payload !== null,
        intervalo: c.intervaloCalibracion,
        tablasSeleccionadas: Object.values(c.selecciones).filter(s => s.seleccionada).length
      })),
      primerPayload: payloads[0]
    });

    if (!payloads.length) {
      this.alert.warning(
        'No hay ningún CMC válido calculado todavía. Revisa las tablas seleccionadas.',
        'Sin resultados'
      );
      return;
    }

    this.mostrarResultadosCmc = true;
    this.refresh();

    setTimeout(() => this.refresh());
  }

  onResultadoCalculado(resultados: CmcResultado[]): void {
    this.resultadosCmc = resultados ?? [];
    console.log('[Cmcparams] Resultados CMC recibidos:', this.resultadosCmc);
  }

  cerrarResultadosCmc(): void {
    this.mostrarResultadosCmc = false;
    this.resultadosCmc = [];
    this.refresh();
  }

  toggleResultadosCmc(): void {
    if (!this.hayCmcCalculados) {
      this.alert.info(
        'Aún no hay CMC calculados. Presiona "Calcular y ver CMC".',
        'Sin resultados'
      );
      return;
    }
    this.mostrarResultadosCmc = !this.mostrarResultadosCmc;
    this.refresh();
  }

  private refresh(): void {
    this.cdr.markForCheck();
  }
}
