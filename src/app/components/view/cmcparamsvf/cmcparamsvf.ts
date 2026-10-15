// El componente actual se mantiene igual, este componente es una versión mejorada de cmcparams
import {
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { CertService } from '../../../services/cert.service';
import { AlertService } from '../../../services/alert.service';
import { ApiResponse, Column, ResultTable } from '../../../models/certificado.models';
import {
  CmcPayload,
  CmcTablaSeleccion,
  CmcFilaDetalle,
  CmcConfiguracion,
  CmcMultiPayload,
  CmcResultado,
} from '../../../models/cmc.model';
import { Cmcsr } from '../../core/cmcsr/cmcsr';

/**
 * Resultado del parseo de un valor de referencia.
 * - `numero`: valor normalizado a la unidad base (V, A, Ω, ...).
 * - `texto`: sufijo/prefijo original SIN el número (ej: " mV", " V", "").
 * - `unidadBase`: multiplicador aplicado a la unidad base (1, 1e-3, 1e3, ...).
 * - `unidadTexto`: texto de la unidad original (ej: "mV", "V", "").
 */
interface ValorReferenciaParseado {
  numero: number;
  texto: string;
  unidadBase: number;
  unidadTexto: string;
}

interface FilaRangoInfo {
  error: number;
  incertidumbre: number;
  valorReferenciaRaw: string;
  valorReferenciaNum: number;   // normalizado a unidad base
  valorReferenciaTexto: string; // texto original SIN el número
  valorReferenciaUnidadTexto: string; // unidad original (mV, V, ...)
}

@Component({
  selector: 'app-cmcparamsvf',
  standalone: true,
  imports: [FormsModule, CommonModule, Cmcsr],
  templateUrl: './cmcparamsvf.html',
  styleUrl: './cmcparamsvf.css',
})
export class Cmcparamsvf implements OnInit {

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

  private _cmcsParaMostrarCache: CmcPayload[] = [];
  private _claveCacheCmcs = '';

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

  /**
   * Factores de conversión a la unidad base.
   * La unidad base es la que aparece con exponente 0 (V, A, Ω, Hz, F, ...).
   */
  private readonly factoresUnidad: Record<string, number> = {
    // Tensión (base: V)
    'nv': 1e-9, 'uv': 1e-6, 'µv': 1e-6, 'mv': 1e-3,
    'v': 1,
    'kv': 1e3, 'mv_': 1e6, 'mv__': 1e6, // duplicado por seguridad
    // Corriente (base: A)
    'na': 1e-9, 'ua': 1e-6, 'µa': 1e-6, 'ma': 1e-3,
    'a': 1,
    'ka': 1e3,
    // Resistencia (base: Ω)
    'mohm': 1e-3, 'mΩ': 1e-3, 'mω': 1e-3,
    'ohm': 1, 'Ω': 1, 'ω': 1,
    'kohm': 1e3, 'kΩ': 1e3, 'kω': 1e3,
    'mohm_': 1e6, 'mΩ_': 1e6, 'mω_': 1e6,
    'gohm': 1e9, 'gΩ': 1e9, 'gω': 1e9,
    // Frecuencia (base: Hz)
    'mhz': 1e-3, 'hz': 1, 'khz': 1e3, 'mhz_': 1e6, 'ghz': 1e9,
    // Capacitancia (base: F)
    'pf': 1e-12, 'nf': 1e-9, 'uf': 1e-6, 'µf': 1e-6,
    'mf': 1e-3, 'f': 1, 'mf_': 1e-3
  };

  constructor(
    private readonly cert: CertService,
    private readonly alert: AlertService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarEquipos();
  }

  // ============================================================
  //   GETTERS DE ESTADO
  // ============================================================

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

  // ============================================================
  //   HELPERS DE UNIDAD
  // ============================================================

  formatColumnLabel(col: Column | undefined): string {
    if (!col) return '';
    const label = col.label || col.key || '';
    const unit = (col as any)?.unit;
    const unitStr = unit === null || unit === undefined ? '' : String(unit).trim();
    if (!unitStr || unitStr.toUpperCase() === 'N/A') return label;
    return `${label} (${unitStr})`;
  }

  // ============================================================
  //   VALIDACIÓN NUMÉRICA
  // ============================================================

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

  // ============================================================
  //   CARGA DE EQUIPOS
  // ============================================================

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

  // ============================================================
  //   PANEL CMC (configuración)
  // ============================================================

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
      const colRef = this.detectarColumnaReferencia(tabla);
      const primeraColKey = tabla.columns[0]?.key ?? '';

      selecciones[idx] = {
        seleccionada: true,
        filaIndex: 0,
        columnaReferenciaKey: colRef?.key ?? primeraColKey,
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

  private detectarColumnaReferencia(tabla: ResultTable): Column | undefined {
    return tabla.columns.find(c =>
      /patr[oó]n|valor.*referencia|referencia.*magnitud|nominal|reference/i.test(c.key) ||
      /patr[oó]n|valor.*referencia|referencia.*magnitud|nominal|reference/i.test(c.label ?? '')
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

  // ============================================================
  //   HELPERS DE VISUALIZACIÓN
  // ============================================================

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

  // ============================================================
  //   HELPERS PARA MIN/MAX Y DÍAS
  // ============================================================

  getMinReferencia(index: number): string {
    const sel = this.seleccionCmc[index];
    const tabla = this.filteredTablas[index];
    if (!sel || !tabla) return '—';

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const rangoObjetivo = String(
      this.getValorCelda(tabla, sel.filaIndex, colIntervaloKey) ?? ''
    ).trim();
    if (!rangoObjetivo) return '—';

    const filas = this.obtenerFilasMismoRango(tabla, sel, colIntervaloKey, rangoObjetivo);
    if (!filas.length) return '—';

    // Nos quedamos con el valor MÍNIMO considerando la unidad normalizada
    let mejor: FilaRangoInfo | null = null;
    for (const f of filas) {
      if (mejor === null || f.valorReferenciaNum < mejor.valorReferenciaNum) {
        mejor = f;
      }
    }
    if (!mejor) return '—';

    return this.formatearValorConTexto(
      mejor.valorReferenciaRaw,
      mejor.valorReferenciaNum
    );
  }

  getMaxReferencia(index: number): string {
    const sel = this.seleccionCmc[index];
    const tabla = this.filteredTablas[index];
    if (!sel || !tabla) return '—';

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const rangoObjetivo = String(
      this.getValorCelda(tabla, sel.filaIndex, colIntervaloKey) ?? ''
    ).trim();
    if (!rangoObjetivo) return '—';

    const filas = this.obtenerFilasMismoRango(tabla, sel, colIntervaloKey, rangoObjetivo);
    if (!filas.length) return '—';

    let mejor: FilaRangoInfo | null = null;
    for (const f of filas) {
      if (mejor === null || f.valorReferenciaNum > mejor.valorReferenciaNum) {
        mejor = f;
      }
    }
    if (!mejor) return '—';

    return this.formatearValorConTexto(
      mejor.valorReferenciaRaw,
      mejor.valorReferenciaNum
    );
  }

  getDiasDesdeAnterior(index: number): number | null {
    const tabla = this.filteredTablas[index];
    const cert = this.getCertificado(tabla);
    if (!cert) return null;

    const fechaRaw = cert.date_cal || cert.date_cc;
    const fecha = fechaRaw ? new Date(fechaRaw) : null;
    if (!fecha || isNaN(fecha.getTime())) return null;

    const fechas: { idx: number; fecha: Date }[] = [];

    Object.entries(this.seleccionCmc).forEach(([idxStr, s]) => {
      if (!s.seleccionada) return;
      const t = this.filteredTablas[Number(idxStr)];
      const c = this.getCertificado(t);
      if (!c) return;
      const fRaw = c.date_cal || c.date_cc;
      const f = fRaw ? new Date(fRaw) : null;
      if (!f || isNaN(f.getTime())) return;
      fechas.push({ idx: Number(idxStr), fecha: f });
    });

    if (fechas.length < 2) return null;

    fechas.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    const pos = fechas.findIndex(f => f.idx === index);
    if (pos <= 0) return null;

    const ms = fechas[pos].fecha.getTime() - fechas[pos - 1].fecha.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  // ============================================================
  //   MARCADO EN LAS TABLAS DE RESULTADOS
  // ============================================================

  // ============================================================
  //   MARCADO EN LAS TABLAS DE RESULTADOS (por RANGO)
  // ============================================================

  /**
   * Paleta de colores por CMC (índice = número de CMC - 1).
   * Se usa para pintar por bloques los rangos de cada CMC.
   */
  private readonly paletaCmc: { bg: string; border: string; badge: string }[] = [
    { bg: 'rgba(13, 110, 253, 0.10)', border: '#0d6efd', badge: '#0d6efd' }, // azul
    { bg: 'rgba(25, 135, 84, 0.10)',  border: '#198754', badge: '#198754' }, // verde
    { bg: 'rgba(255, 193, 7, 0.15)',  border: '#ffc107', badge: '#ffc107' }, // amarillo
    { bg: 'rgba(220, 53, 69, 0.10)',  border: '#dc3545', badge: '#dc3545' }, // rojo
    { bg: 'rgba(111, 66, 193, 0.10)', border: '#6f42c1', badge: '#6f42c1' }, // morado
    { bg: 'rgba(13, 202, 240, 0.10)', border: '#0dcaf0', badge: '#0dcaf0' }, // cyan
    { bg: 'rgba(253, 126, 20, 0.10)', border: '#fd7e14', badge: '#fd7e14' }, // naranja
    { bg: 'rgba(214, 51, 132, 0.10)', border: '#d63384', badge: '#d63384' }, // rosa
  ];

  private getColorCmc(id: number): { bg: string; border: string; badge: string } {
    if (id <= 0) return this.paletaCmc[0];
    return this.paletaCmc[(id - 1) % this.paletaCmc.length];
  }

  /**
   * Devuelve los CMC a los que pertenece una fila, considerando
   * TODAS las filas del rango al que pertenece la fila seleccionada.
   */
  getCmcsDeFila(tableIndex: number, rowIndex: number): number[] {
    const ids = new Set<number>();
    const tabla = this.filteredTablas[tableIndex];
    if (!tabla) return [];

    const colIntervaloKey = tabla.columns[0]?.key ?? '';

    for (const cmc of this.cmcs) {
      const sel = cmc.selecciones[tableIndex];
      if (!sel?.seleccionada) continue;

      // Rango objetivo del CMC (extraído de la fila seleccionada)
      const rangoObjetivo = String(
        this.getValorCelda(tabla, sel.filaIndex, colIntervaloKey) ?? ''
      ).trim();
      if (!rangoObjetivo) continue;

      // Rango de la fila actual
      const rangoFila = String(
        this.getValorCelda(tabla, rowIndex, colIntervaloKey) ?? ''
      ).trim();

      if (this.normalizarRango(rangoFila) === this.normalizarRango(rangoObjetivo)) {
        ids.add(cmc.id);
      }
    }

    return Array.from(ids);
  }

  /**
   * Indica si una fila es la PRIMERA del rango activo (para dibujar
   * el badge de CMC solo en la cabecera del bloque).
   */
  esPrimeraFilaDelRango(tableIndex: number, rowIndex: number, cmcId: number): boolean {
    const tabla = this.filteredTablas[tableIndex];
    if (!tabla) return false;

    const cmc = this.cmcs.find(c => c.id === cmcId);
    if (!cmc) return false;

    const sel = cmc.selecciones[tableIndex];
    if (!sel?.seleccionada) return false;

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const rangoObjetivo = String(
      this.getValorCelda(tabla, sel.filaIndex, colIntervaloKey) ?? ''
    ).trim();
    if (!rangoObjetivo) return false;

    const rangoFila = String(
      this.getValorCelda(tabla, rowIndex, colIntervaloKey) ?? ''
    ).trim();
    if (this.normalizarRango(rangoFila) !== this.normalizarRango(rangoObjetivo)) {
      return false;
    }

    // Verificar que la fila ANTERIOR (rowIndex - 1) NO pertenezca al mismo rango
    if (rowIndex === 0) return true;

    const rangoAnterior = String(
      this.getValorCelda(tabla, rowIndex - 1, colIntervaloKey) ?? ''
    ).trim();

    return this.normalizarRango(rangoAnterior) !== this.normalizarRango(rangoObjetivo);
  }

  /**
   * Clases CSS que se aplican a cada celda de la tabla de resultados.
   * Marca el rango completo (no solo la fila seleccionada) y colorea
   * por CMC para formar bloques visuales.
   */
 getCellClasses(tableIndex: number, rowIndex: number, colKey: string): Record<string, boolean> {
    const classes: Record<string, boolean> = {};
    const tabla = this.filteredTablas[tableIndex];
    if (!tabla) return classes;

    const cmcsEnFila = this.getCmcsDeFila(tableIndex, rowIndex);
    if (!cmcsEnFila.length) return classes;

    classes['cell-fila-seleccionada'] = true;

    const colIntervaloKey = tabla.columns[0]?.key ?? '';

    // Acumulamos todas las columnas que SÍ participan (por si hay varios CMC)
    const columnasUsadas = new Set<string>();
    columnasUsadas.add(colIntervaloKey);

    let hayColumnasEspeciales = false;

    for (const cmcId of cmcsEnFila) {
      const cmc = this.cmcs.find(c => c.id === cmcId);
      if (!cmc) continue;
      const sel = cmc.selecciones[tableIndex];
      if (!sel?.seleccionada) continue;

      if (colKey === colIntervaloKey)              { classes['cell-rango'] = true;          hayColumnasEspeciales = true; }
      if (colKey === sel.columnaReferenciaKey)     { classes['cell-referencia'] = true;     hayColumnasEspeciales = true; }
      if (colKey === sel.columnaErrorKey)          { classes['cell-error'] = true;          hayColumnasEspeciales = true; }
      if (colKey === sel.columnaIncertidumbreKey)  { classes['cell-incertidumbre'] = true;  hayColumnasEspeciales = true; }

      columnasUsadas.add(sel.columnaReferenciaKey);
      columnasUsadas.add(sel.columnaErrorKey);
      columnasUsadas.add(sel.columnaIncertidumbreKey);
    }

    // 👇 Si la columna NO participa en el cálculo, la marcamos como "no usada"
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

    // ¿La columna es "especial"? Si sí, el CSS se encarga del fondo.
    for (const cmcId of cmcsEnFila) {
      const cmc = this.cmcs.find(c => c.id === cmcId);
      if (!cmc) continue;
      const sel = cmc.selecciones[tableIndex];
      if (!sel?.seleccionada) continue;

      if (colKey === colIntervaloKey)              return {};
      if (colKey === sel.columnaReferenciaKey)     return {};
      if (colKey === sel.columnaErrorKey)          return {};
      if (colKey === sel.columnaIncertidumbreKey)  return {};
    }

    // Celda normal: tinte suave del color del CMC para reforzar el bloque
    return { 'background-color': color.bg };
  }

  /**
   * Devuelve el estilo del badge flotante (columna inicial).
   */
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

  // ============================================================
  //   PARSER Y NORMALIZACIÓN DE VALORES DE REFERENCIA
  // ============================================================

  /**
   * Parsea un valor de referencia tipo "100 mV", "0.1V", "abc",
   * "1,5 kV", "1e-3 mV", etc.
   *
   * Devuelve:
   *  - numero: valor normalizado a unidad base (V, A, Ω, ...)
   *  - texto:  texto original SIN el número
   *  - unidadBase: factor de conversión aplicado
   *  - unidadTexto: texto de la unidad (mV, V, ...)
   */
  private parsearValorReferencia(raw: string): ValorReferenciaParseado {
    const original = String(raw ?? '').trim();

    // Extraer número (con coma/punto y notación científica)
    const match = original.match(/-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/);

    if (!match || match.index === undefined) {
      return { numero: NaN, texto: original, unidadBase: 1, unidadTexto: '' };
    }

    const numStr = match[0];
    const numeroOriginal = Number(numStr.replace(',', '.'));

    const antes = original.slice(0, match.index);
    const despues = original.slice(match.index + numStr.length);
    const textoCompleto = `${antes}${despues}`;

    // Detectar unidad: buscar sufijo alfabético en el texto completo
    const unidadMatch = textoCompleto.match(/[a-zA-ZµΩω]+/);
    const unidadTexto = unidadMatch ? unidadMatch[0] : '';

    const factor = this.obtenerFactorUnidad(unidadTexto);
    const numero = isFinite(numeroOriginal) ? numeroOriginal * factor : NaN;

    return {
      numero,
      texto: textoCompleto,      // guardamos el texto ORIGINAL (con unidad y espacios)
      unidadBase: factor,
      unidadTexto
    };
  }

  /**
   * Obtiene el factor de conversión a unidad base.
   * Si no se reconoce la unidad, devuelve 1.
   */
  private obtenerFactorUnidad(unidadTexto: string): number {
    if (!unidadTexto) return 1;

    const norm = unidadTexto
      .trim()
      .toLowerCase()
      .replace(/μ/g, 'u')
      .replace(/µ/g, 'u');

    // Prefijos SI comunes (sensibles a mayúsculas en el texto original)
    const u = unidadTexto.trim();
    const uLower = u.toLowerCase();

    // Prefijos con "k" o "K"
    if (/^k/i.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e3 * factorBase;
    }
    // Prefijos con "M" (mega) — ojo con "m" (mili) que va abajo
    if (/^M/.test(u) && !/^m/.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e6 * factorBase;
    }
    // Prefijos con "G"
    if (/^G/i.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e9 * factorBase;
    }
    // Prefijos con "m" (mili)
    if (/^m/.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e-3 * factorBase;
    }
    // Prefijos con "u" o "µ" (micro)
    if (/^u|^µ/i.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e-6 * factorBase;
    }
    // Prefijos con "n"
    if (/^n/i.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e-9 * factorBase;
    }
    // Prefijos con "p"
    if (/^p/i.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e-12 * factorBase;
    }

    // Sin prefijo: ver si es unidad base
    const baseDirecta = this.factorUnidadBase(uLower);
    if (baseDirecta !== 1 || this.esUnidadBase(uLower)) {
      return baseDirecta;
    }

    // Unidad desconocida → factor 1 (no se puede normalizar)
    return 1;
  }

  /**
   * Devuelve el factor de la unidad base sin prefijo.
   * V, A, Ω, Hz, F → 1
   */
  private factorUnidadBase(unidad: string): number {
    const u = unidad
      .trim()
      .toLowerCase()
      .replace(/μ/g, 'u')
      .replace(/µ/g, 'u');

    // Quitar posibles caracteres residuales
    const uClean = u.replace(/[^a-z]/g, '');

    switch (uClean) {
      case 'v':    return 1;
      case 'a':    return 1;
      case 'ohm':
      case 'ω':    return 1;
      case 'hz':   return 1;
      case 'f':    return 1;
      default:     return 1;
    }
  }

  private esUnidadBase(unidad: string): boolean {
    const u = unidad
      .trim()
      .toLowerCase()
      .replace(/μ/g, 'u')
      .replace(/µ/g, 'u')
      .replace(/[^a-z]/g, '');
    return ['v', 'a', 'ohm', 'ω', 'hz', 'f'].includes(u);
  }

  /**
   * Reconstruye un valor de referencia para mostrarlo.
   * - Si el valor ORIGINAL tenía texto (unidad), devuelve `numeroOriginal + texto`.
   * - Si NO tenía texto, devuelve solo el número.
   *
   * ⚠️ El número que se muestra es el ORIGINAL (no el normalizado),
   *    porque el usuario ve el valor tal como está en la tabla.
   */
  private formatearValorConTexto(rawOriginal: string, numeroNormalizado: number): string {
    const original = String(rawOriginal ?? '').trim();
    const match = original.match(/-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/);

    if (!match || match.index === undefined) {
      // No hay número → devolvemos el texto tal cual
      return original;
    }

    // Si el texto (quitando el número) está vacío, devolvemos solo el número
    const antes = original.slice(0, match.index);
    const despues = original.slice(match.index + match[0].length);
    const textoSinNumero = `${antes}${despues}`;

    if (textoSinNumero.trim() === '') {
      // No tenía unidad → devolvemos solo el número tal cual apareció
      return match[0];
    }

    // Tenía texto → devolvemos el valor ORIGINAL completo (número + unidad)
    return original;
  }

  // ============================================================
  //   AGRUPACIÓN POR RANGO Y PROMEDIOS
  // ============================================================

  private obtenerFilasMismoRango(
    tabla: ResultTable,
    sel: CmcTablaSeleccion,
    colIntervaloKey: string,
    rangoObjetivo: string
  ): FilaRangoInfo[] {
    const resultado: FilaRangoInfo[] = [];
    const objetivoNorm = this.normalizarRango(rangoObjetivo);

    for (let i = 0; i < (tabla.rows?.length ?? 0); i++) {
      const row = tabla.rows[i];
      const rangoRaw = String(row[colIntervaloKey] ?? '').trim();
      if (this.normalizarRango(rangoRaw) !== objetivoNorm) continue;

      const rawError = this.getValorCelda(tabla, i, sel.columnaErrorKey);
      const rawInc   = this.getValorCelda(tabla, i, sel.columnaIncertidumbreKey);
      const rawRef   = this.getValorCelda(tabla, i, sel.columnaReferenciaKey);

      if (rawError === null || rawInc === null || rawRef === null) continue;
      if (!this.esNumeroValido(rawError) ||
          !this.esNumeroValido(rawInc)) continue;

      const error = Number(String(rawError).replace(',', '.'));
      const incertidumbre = Number(String(rawInc).replace(',', '.'));

      if (!isFinite(error) || !isFinite(incertidumbre)) continue;

      const parsedRef = this.parsearValorReferencia(String(rawRef));
      if (!isFinite(parsedRef.numero)) continue;

      resultado.push({
        error,
        incertidumbre,
        valorReferenciaRaw: String(rawRef),
        valorReferenciaNum: parsedRef.numero,
        valorReferenciaTexto: parsedRef.texto,
        valorReferenciaUnidadTexto: parsedRef.unidadTexto
      });
    }

    return resultado;
  }

  private normalizarRango(v: string): string {
    return String(v ?? '')
      .replace(/\s+/g, '')
      .replace(/±/g, '')
      .toLowerCase();
  }

  // ============================================================
  //   CÁLCULO — TODOS LOS CMCS
  // ============================================================

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

    // ------------------------------------------------------------
    // 1) Determinar rango objetivo por tabla desde la fila
    //    seleccionada (columna Intervalo = primera columna)
    // ------------------------------------------------------------
    const rangosNormalizados = new Set<string>();
    const colIntervaloPorTabla: Record<number, string> = {};

    for (const { idx, s } of entradas) {
      const tabla = this.filteredTablas[idx];
      if (!tabla) {
        limpiar();
        return { ok: false, motivo: `tabla #${idx + 1}: no encontrada` };
      }

      const colIntervaloKey = tabla.columns[0]?.key ?? '';
      colIntervaloPorTabla[idx] = colIntervaloKey;

      const rangoRaw = String(
        this.getValorCelda(tabla, s.filaIndex, colIntervaloKey) ?? ''
      ).trim();

      if (!rangoRaw) {
        limpiar();
        return { ok: false, motivo: `tabla #${idx + 1}: la fila seleccionada no tiene rango` };
      }

      rangosNormalizados.add(this.normalizarRango(rangoRaw));
    }

    if (rangosNormalizados.size > 1) {
      limpiar();
      return {
        ok: false,
        motivo: `los rangos seleccionados no coinciden entre tablas (${Array.from(rangosNormalizados).join(' vs ')})`
      };
    }

    const rangoObjetivo = (() => {
      const primeraEntrada = entradas[0];
      const tabla = this.filteredTablas[primeraEntrada.idx];
      const colIntervaloKey = colIntervaloPorTabla[primeraEntrada.idx];
      return String(
        this.getValorCelda(tabla, primeraEntrada.s.filaIndex, colIntervaloKey) ?? ''
      ).trim();
    })();

    // ------------------------------------------------------------
    // 2) Construir filas válidas (promediando por rango)
    // ------------------------------------------------------------
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
      minRef: string;
      maxRef: string;
      nRegistros: number;
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

      const colIntervaloKey = colIntervaloPorTabla[idx];
      const filasRango = this.obtenerFilasMismoRango(
        tabla, s, colIntervaloKey, rangoObjetivo
      );

      if (!filasRango.length) {
        invalidos.push(
          `tabla #${idx + 1}: no hay filas con el rango "${rangoObjetivo}"`
        );
        continue;
      }

      const n = filasRango.length;
      const sumaError = filasRango.reduce((acc, f) => acc + f.error, 0);
      const sumaInc = filasRango.reduce((acc, f) => acc + f.incertidumbre, 0);

      const errorProm = sumaError / n;
      const incertidumbreProm = sumaInc / n;

      // ------------------------------------------------------------
      // Min/Max sobre los VALORES DE REFERENCIA de las filas
      // del mismo rango, comparando por unidad normalizada.
      // Se preserva el texto/unidad del elemento ganador.
      // ------------------------------------------------------------
      let filaMin: FilaRangoInfo | null = null;
      let filaMax: FilaRangoInfo | null = null;

      for (const f of filasRango) {
        if (filaMin === null || f.valorReferenciaNum < filaMin.valorReferenciaNum) {
          filaMin = f;
        }
        if (filaMax === null || f.valorReferenciaNum > filaMax.valorReferenciaNum) {
          filaMax = f;
        }
      }

      const minRef = filaMin
        ? this.formatearValorConTexto(filaMin.valorReferenciaRaw, filaMin.valorReferenciaNum)
        : rangoObjetivo;

      const maxRef = filaMax
        ? this.formatearValorConTexto(filaMax.valorReferenciaRaw, filaMax.valorReferenciaNum)
        : rangoObjetivo;

      filasValidas.push({
        idx,
        tabla,
        cert,
        fecha,
        error: errorProm,
        incertidumbre: incertidumbreProm,
        cc: cert.cc || tabla.cc_id || '',
        table_id: tabla.table_id || '',
        rango: rangoObjetivo,
        minRef,
        maxRef,
        nRegistros: n
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

    // ------------------------------------------------------------
    // 3) Ordenar por fecha y calcular días intermedios
    // ------------------------------------------------------------
    filasValidas.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    const errores = filasValidas.map(x => x.error);
    const incertidumbres = filasValidas.map(x => x.incertidumbre);
    const fechasCalibracion = filasValidas.map(x => x.fecha.toISOString());
    const certificados = filasValidas.map(x => x.cc);
    const rangoReferencia = filasValidas[0].rango;
    const minReferencia = filasValidas[0].minRef;
    const maxReferencia = filasValidas[0].maxRef;

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
        rango: x.rango,
        nRegistros: x.nRegistros
      });
    });

    // ------------------------------------------------------------
    // 4) Payload
    // ------------------------------------------------------------
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
      detalle,
      minReferencia,
      maxReferencia,
      nRegistrosPorCertificado: filasValidas.map(x => x.nRegistros)
    };

    cmc.payload = payload;
    cmc.payloadTexto = this.construirTextoPayload(payload);

    return { ok: true };
  }

  private construirTextoPayload(p: CmcPayload): string {
    const fmt = (arr: number[]) => `c(${arr.map(n => n.toString()).join(',')})`;

    const minRef = p.minReferencia ?? p.rangoReferencia;
    const maxRef = p.maxReferencia ?? p.rangoReferencia;

    return [
      `# === CMC #${p.cmcNumero} ===`,
      `#ID ${p.id}`,
      `#Cálculo de la CMC para un valor de referencia en el intervalo de calibración`,
      ``,
      `#Certificados involucrados: ${p.certificados.join(', ')}`,
      ``,
      `#Entradas:`,
      ``,
      `errores=${fmt(p.errores)} #Promedio de errores por certificado (mismo rango)`,
      `incertidumbres=${fmt(p.incertidumbres)} #Promedio de incertidumbres por certificado (mismo rango)`,
      `tiempo.intermedio=${fmt(p.tiempoIntermedio)} #Días entre calibraciones, desde el más antiguo al más reciente`,
      `intervalo.calibracion=${p.intervaloCalibracion} #Se reporta en meses`,
      `rango=${p.rangoReferencia} #Rango de referencia seleccionado`,
      `min.referencia=${minRef} #Valor mínimo de referencia del rango`,
      `max.referencia=${maxRef} #Valor máximo de referencia del rango`
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

  // ============================================================
  //   INTEGRACIÓN CON EL COMPONENTE DE RESULTADOS (Cmcsr)
  // ============================================================

  calcularYMostrarCmc(): void {
    try {
      this.calcularTodosLosCmc();
    } catch (e) {
      console.error('[Cmcparamsvf] Excepción en calcularTodosLosCmc:', e);
      this.alert.error('Ocurrió un error inesperado al calcular los CMC. Revisa la consola.', 'Error');
      return;
    }

    const payloads = this.cmcsParaMostrar;

    console.log('[Cmcparamsvf] calcularYMostrarCmc()', {
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
    console.log('[Cmcparamsvf] Resultados CMC recibidos:', this.resultadosCmc);
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

  // ============================================================
  //   UTILIDADES
  // ============================================================

  private refresh(): void {
    this.cdr.markForCheck();
  }
}