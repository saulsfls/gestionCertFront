// Componente mejorado de cmcparams
import {
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { CertService } from '../../../services/database/cert.service';
import { AlertService } from '../../../services/core/alert.service';
import { ApiResponse, Column, ResultTable } from '../../../models/certificado.models';
import {
  CmcPayload,
  CmcTablaSeleccion,
  CmcFilaDetalle,
  CmcConfiguracion,
  CmcMultiPayload,
  CmcResultado,
} from '../../../models/cmc.model';

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
  valorReferenciaNum: number;
  valorReferenciaTexto: string;
  valorReferenciaUnidadTexto: string;
}

interface IntervaloUnico {
  valor: string;
  filaIndex: number;
}

/**
 * Estructura que representa una fila de la tabla "Valores seleccionados".
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

/**
 * Extensión local de CmcConfiguracion.
 */
type CmcConfiguracionExt = CmcConfiguracion & {
  todasTienenRangos?: boolean;
  intervaloBloqueado?: boolean;
  intervaloAlertaMostrada?: boolean;
};

@Component({
  selector: 'app-cmcparamsvf',
  standalone: true,
  imports: [FormsModule, CommonModule],
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

  cmcs: CmcConfiguracionExt[] = [];
  cmcActivoId = 1;

  copiadoCmc = false;

  mostrarResultadosCmc = false;
  resultadosCmc: CmcResultado[] = [];

  dropdownIntervaloAbierto = false;

  private readonly rutaResultadosCmc = '/cmc-resultados';

  // 🔧 NG0103: caché explícito de payloads (se recalcula SOLO desde eventos)
  private _payloadsCache: CmcPayload[] = [];

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

  private readonly factoresUnidad: Record<string, number> = {
    'nv': 1e-9, 'uv': 1e-6, 'µv': 1e-6, 'mv': 1e-3,
    'v': 1,
    'kv': 1e3, 'mv_': 1e6, 'mv__': 1e6,
    'na': 1e-9, 'ua': 1e-6, 'µa': 1e-6, 'ma': 1e-3,
    'a': 1,
    'ka': 1e3,
    'mohm': 1e-3, 'mΩ': 1e-3, 'mω': 1e-3,
    'ohm': 1, 'Ω': 1, 'ω': 1,
    'kohm': 1e3, 'kΩ': 1e3, 'kω': 1e3,
    'mohm_': 1e6, 'mΩ_': 1e6, 'mω_': 1e6,
    'gohm': 1e9, 'gΩ': 1e9, 'gω': 1e9,
    'mhz': 1e-3, 'hz': 1, 'khz': 1e3, 'mhz_': 1e6, 'ghz': 1e9,
    'pf': 1e-12, 'nf': 1e-9, 'uf': 1e-6, 'µf': 1e-6,
    'mf': 1e-3, 'f': 1, 'mf_': 1e-3
  };

  constructor(
    private readonly cert: CertService,
    private readonly alert: AlertService,
    private readonly cdr: ChangeDetectorRef,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.cargarEquipos();
  }

  // Getters de estado

  get cmcActivo(): CmcConfiguracionExt | undefined {
    return this.cmcs.find(c => c.id === this.cmcActivoId);
  }

  get seleccionCmc(): Record<number, CmcTablaSeleccion> {
    return this.cmcActivo?.selecciones ?? {};
  }

  // 🔧 NG0103: getter puro, sin mutación
  get cmcsParaMostrar(): CmcPayload[] {
    return this._payloadsCache;
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

  get intervalosCertificadosUnicos(): number[] {
    const cmc = this.cmcActivo;
    if (!cmc) return [];

    const nums = new Set<number>();

    for (const [idxStr, sel] of Object.entries(cmc.selecciones)) {
      if (!sel.seleccionada) continue;
      const idx = Number(idxStr);
      const tabla = this.filteredTablas[idx];
      if (!tabla) continue;
      const cert = this.getCertificado(tabla);
      if (!cert) continue;
      const num = this.parsearIntervaloMeses(cert.calibration_interval);
      if (isFinite(num)) nums.add(num);
    }

    return Array.from(nums).sort((a, b) => a - b);
  }

  // 🔧 NG0103: recalcula el caché explícitamente (nunca dentro de getters)
  private recalcularCachePayloads(): void {
    this._payloadsCache = this.cmcs
      .filter(c => c.payload !== null)
      .map(c => c.payload as CmcPayload);
  }

  // Helpers de unidad

  formatColumnLabel(col: Column | undefined): string {
    if (!col) return '';
    const label = col.label || col.key || '';
    const unit = (col as any)?.unit;
    const unitStr = unit === null || unit === undefined ? '' : String(unit).trim();
    if (!unitStr || unitStr.toUpperCase() === 'N/A') return label;
    return `${label} (${unitStr})`;
  }

  // Validación numérica

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

  // Carga de equipos

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
    this._payloadsCache = [];   // 🔧 NG0103
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

          // 🔍 DIAGNÓSTICO PT
          console.groupCollapsed('%c[CMC → CERTIFICADOS] pt por CC', 'color:#6f42c1;font-weight:bold;');
          pendientes.forEach(cc => {
            const cert = this.certificadosPorCc[cc];
            console.log(`cc=${cc} → cert.pt =`, cert?.pt, '| procedimiento_tecnico =', cert?.procedimiento_tecnico);
          });
          console.groupEnd();

          if (this.mostrarPanelCmc && this.cmcActivo) {
            this.sincronizarIntervaloDesdeCertificados(this.cmcActivo, false);
          }

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
    this._payloadsCache = [];   // 🔧 NG0103
    this.cerrarPanelCmc();
    this.cerrarResultadosCmc();
    this.refresh();
    this.alert.info('Filtros restablecidos.', 'Sin filtros');
  }

  // Panel CMC: configuración

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

    const activo = this.cmcs.find(c => c.id === this.cmcActivoId);
    if (activo) {
      this.sincronizarIntervaloDesdeCertificados(activo, true);
    }

    this.mostrarPanelCmc = true;
    this.panelCmcColapsado = false;
    this.dropdownIntervaloAbierto = false;
    this.refresh();
  }

  cerrarPanelCmc(): void {
    this.mostrarPanelCmc = false;
    this.panelCmcColapsado = false;
    this.cmcs = [];
    this.cmcActivoId = 1;
    this.dropdownIntervaloAbierto = false;
    this._payloadsCache = [];   // 🔧 NG0103
    this.cerrarResultadosCmc();
    this.refresh();
  }

  togglePanelCmc(): void {
    this.panelCmcColapsado = !this.panelCmcColapsado;
    this.dropdownIntervaloAbierto = false;
    this.refresh();
  }

  private crearCmcConfig(id: number): CmcConfiguracionExt {
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

    const cmc: CmcConfiguracionExt = {
      id,
      intervaloCalibracion: 0,
      selecciones,
      payload: null,
      payloadTexto: '',
      todasTienenRangos: true,
      intervaloBloqueado: false,
      intervaloAlertaMostrada: false
    };

    this.sincronizarIntervaloDesdeCertificados(cmc, false);
    return cmc;
  }

  nuevoCmc(): void {
    const nextId = this.cmcs.length ? Math.max(...this.cmcs.map(c => c.id)) + 1 : 1;
    const nuevo = this.crearCmcConfig(nextId);
    this.cmcs.push(nuevo);
    this.cmcActivoId = nextId;
    this.sincronizarIntervaloDesdeCertificados(nuevo, true);
    this.dropdownIntervaloAbierto = false;
    this.refresh();
    this.alert.success(
      `Se creó el CMC #${nextId}. Configura las tablas y presiona "Calcular CMC".`,
      'Nuevo CMC'
    );
  }

  seleccionarCmc(id: number): void {
    this.cmcActivoId = id;
    const cmc = this.cmcs.find(c => c.id === id);
    if (cmc) {
      this.sincronizarIntervaloDesdeCertificados(cmc, false);
    }
    this.dropdownIntervaloAbierto = false;
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
    this.recalcularCachePayloads();   // 🔧 NG0103
    this.dropdownIntervaloAbierto = false;
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

  // Sincronización del intervalo de calibración desde los certificados

  private parsearIntervaloMeses(raw: any): number {
    if (raw === null || raw === undefined) return NaN;
    if (typeof raw === 'number') {
      return isFinite(raw) && raw > 0 ? raw : NaN;
    }
    const s = String(raw).trim();
    if (!s) return NaN;
    const match = s.match(/\d+(?:[.,]\d+)?/);
    if (!match) return NaN;
    const num = Number(match[0].replace(',', '.'));
    return isFinite(num) && num > 0 ? num : NaN;
  }

  private sincronizarIntervaloDesdeCertificados(
    cmc: CmcConfiguracionExt,
    mostrarAlerta: boolean
  ): void {
    this.dropdownIntervaloAbierto = false;

    const intervalosRaw = new Set<string>();
    const intervalosNum: number[] = [];

    for (const [idxStr, sel] of Object.entries(cmc.selecciones)) {
      if (!sel.seleccionada) continue;
      const idx = Number(idxStr);
      const tabla = this.filteredTablas[idx];
      if (!tabla) continue;
      const cert = this.getCertificado(tabla);
      if (!cert) continue;

      const raw = cert.calibration_interval;
      if (raw === null || raw === undefined || String(raw).trim() === '') continue;

      intervalosRaw.add(String(raw).trim());
      const num = this.parsearIntervaloMeses(raw);
      if (isFinite(num)) intervalosNum.push(num);
    }

    if (!intervalosNum.length) {
      cmc.intervaloCalibracion = 0;
      cmc.intervaloBloqueado = false;
      return;
    }

    const todosIguales = intervalosNum.every(n => n === intervalosNum[0]);

    if (todosIguales) {
      cmc.intervaloCalibracion = intervalosNum[0];
      cmc.intervaloBloqueado = true;
      cmc.intervaloAlertaMostrada = false;
      return;
    }

    cmc.intervaloCalibracion = 0;
    cmc.intervaloBloqueado = false;

    if (mostrarAlerta && !cmc.intervaloAlertaMostrada) {
      cmc.intervaloAlertaMostrada = true;
      this.alert.warning(
        `Los certificados de calibración seleccionados tienen intervalos distintos: ` +
        `${Array.from(intervalosRaw).join(', ')}. ` +
        `El campo "Intervalo de calibración (meses)" se ha dejado en 0 para que ingreses el valor manualmente.`,
        'Intervalos de calibración diferentes'
      );
    }
  }

  // Dropdown del input de intervalo

  toggleDropdownIntervalo(): void {
    this.dropdownIntervaloAbierto = !this.dropdownIntervaloAbierto;
    this.refresh();
  }

  seleccionarIntervaloDesdeDropdown(valor: number): void {
    const cmc = this.cmcActivo;
    if (!cmc) return;
    cmc.intervaloCalibracion = valor;
    this.dropdownIntervaloAbierto = false;
    this.refresh();
  }

  // Toggle global "¿las tablas tienen rangos?"

  tablaTieneRangos(_index: number): boolean {
    return this.cmcActivo?.todasTienenRangos !== false;
  }

  todasTablasTienenRangos(): boolean {
    return this.cmcActivo?.todasTienenRangos !== false;
  }

  onToggleTodasTienenRangos(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const cmc = this.cmcActivo;
    if (!cmc) return;

    cmc.todasTienenRangos = checked;

    if (!checked) {
      Object.values(cmc.selecciones).forEach(s => {
        s.filaIndex = 0;
      });
    }

    this.refresh();
  }

  onToggleTieneRangos(_index: number, event: Event): void {
    this.onToggleTodasTienenRangos(event);
  }

  // Intervalos únicos por tabla

  getIntervalosUnicos(index: number): IntervaloUnico[] {
    const tabla = this.filteredTablas[index];
    if (!tabla) return [];

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const vistos = new Map<string, IntervaloUnico>();

    (tabla.rows ?? []).forEach((row, r) => {
      const raw = String(row[colIntervaloKey] ?? '').trim();
      if (!raw) return;
      const norm = this.normalizarRango(raw);
      if (!vistos.has(norm)) {
        vistos.set(norm, { valor: raw, filaIndex: r });
      }
    });

    return Array.from(vistos.values());
  }

  getRangoUnicoSeleccionado(index: number): string {
    const sel = this.seleccionCmc[index];
    const tabla = this.filteredTablas[index];
    if (!sel || !tabla) return '';

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    return String(this.getValorCelda(tabla, sel.filaIndex, colIntervaloKey) ?? '').trim();
  }

  onFilaRangoChange(index: number, valor: string): void {
    const tabla = this.filteredTablas[index];
    const sel = this.seleccionCmc[index];
    if (!tabla || !sel) return;

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const norm = this.normalizarRango(valor);

    const filaIndex = tabla.rows.findIndex(row =>
      this.normalizarRango(String(row[colIntervaloKey] ?? '')) === norm
    );

    if (filaIndex >= 0) {
      sel.filaIndex = filaIndex;
    }

    this.refresh();
  }

  // Lógica de filas

  private obtenerFilasParaCalculo(
    tabla: ResultTable,
    sel: CmcTablaSeleccion,
    colIntervaloKey: string,
    tieneRangos: boolean
  ): FilaRangoInfo[] {
    const resultado: FilaRangoInfo[] = [];
    const rangoObjetivo = tieneRangos
      ? String(this.getValorCelda(tabla, sel.filaIndex, colIntervaloKey) ?? '').trim()
      : '';
    const objetivoNorm = this.normalizarRango(rangoObjetivo);

    for (let i = 0; i < (tabla.rows?.length ?? 0); i++) {
      const row = tabla.rows[i];

      if (tieneRangos) {
        const rangoRaw = String(row[colIntervaloKey] ?? '').trim();
        if (this.normalizarRango(rangoRaw) !== objetivoNorm) continue;
      }

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

  private obtenerFilasMismoRango(
    tabla: ResultTable,
    sel: CmcTablaSeleccion,
    colIntervaloKey: string,
    rangoObjetivo: string
  ): FilaRangoInfo[] {
    const idx = this.filteredTablas.indexOf(tabla);
    const tieneRangos = idx >= 0 ? this.tablaTieneRangos(idx) : true;
    return this.obtenerFilasParaCalculo(tabla, sel, colIntervaloKey, tieneRangos);
  }

  toggleTablaCmc(index: number): void {
    const sel = this.seleccionCmc[index];
    if (!sel) return;
    sel.seleccionada = !sel.seleccionada;

    const cmc = this.cmcActivo;
    if (cmc) {
      this.sincronizarIntervaloDesdeCertificados(cmc, true);
    }

    this.refresh();
  }

  onSelectionChange(): void {
    this.refresh();
  }

  // Helpers de visualización

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

  // 🔧 NG0103: versiones puramente visuales (template del CMC activo)
  getRangoSeleccionado(index: number): string {
    const sel = this.seleccionCmc[index];
    if (!sel) return '';
    const tabla = this.filteredTablas[index];
    if (!tabla) return '';

    if (!this.tablaTieneRangos(index)) {
      const colIntervaloKey = tabla.columns[0]?.key ?? '';
      const valores: string[] = [];
      (tabla.rows ?? []).forEach((row) => {
        const v = String(row[colIntervaloKey] ?? '').trim();
        if (v && !valores.includes(v)) valores.push(v);
      });
      return valores.length ? valores.join(' / ') : 'Toda la tabla';
    }

    const firstColKey = tabla.columns[0]?.key ?? '';
    return this.formatearValor(this.getValorCelda(tabla, sel.filaIndex, firstColKey));
  }

  getErrorSeleccionado(index: number): string {
    const sel = this.seleccionCmc[index];
    const tabla = this.filteredTablas[index];
    if (!sel || !tabla) return '';

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const tieneRangos = this.tablaTieneRangos(index);

    const filas = this.obtenerFilasParaCalculo(tabla, sel, colIntervaloKey, tieneRangos);

    if (!filas.length) {
      return this.formatearValor(
        this.getValorCelda(tabla, sel.filaIndex, sel.columnaErrorKey)
      );
    }

    const errorProm = filas.reduce((acc, f) => acc + f.error, 0) / filas.length;
    return this.formatearValor(errorProm);
  }

  getIncertidumbreSeleccionada(index: number): string {
    const sel = this.seleccionCmc[index];
    const tabla = this.filteredTablas[index];
    if (!sel || !tabla) return '';

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const tieneRangos = this.tablaTieneRangos(index);

    const filas = this.obtenerFilasParaCalculo(tabla, sel, colIntervaloKey, tieneRangos);

    if (!filas.length) {
      return this.formatearValor(
        this.getValorCelda(tabla, sel.filaIndex, sel.columnaIncertidumbreKey)
      );
    }

    const incertidumbreMax = filas.reduce((max, f) => Math.max(max, f.incertidumbre), -Infinity);
    return this.formatearValor(incertidumbreMax);
  }

  getMinReferencia(index: number): string {
    const sel = this.seleccionCmc[index];
    const tabla = this.filteredTablas[index];
    if (!sel || !tabla) return '—';

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const tieneRangos = this.tablaTieneRangos(index);
    const filas = this.obtenerFilasParaCalculo(tabla, sel, colIntervaloKey, tieneRangos);
    if (!filas.length) return '—';

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
    const tieneRangos = this.tablaTieneRangos(index);
    const filas = this.obtenerFilasParaCalculo(tabla, sel, colIntervaloKey, tieneRangos);
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

  // 🔧 NG0103: versiones parametrizadas para el resumen (sin tocar cmcActivoId)
  private getRangoSeleccionadoParaCmc(cmc: CmcConfiguracionExt, index: number): string {
    const sel = cmc.selecciones[index];
    if (!sel) return '';
    const tabla = this.filteredTablas[index];
    if (!tabla) return '';

    const tieneRangos = this.tablaTieneRangosParaCmc(cmc, index);

    if (!tieneRangos) {
      const colIntervaloKey = tabla.columns[0]?.key ?? '';
      const valores: string[] = [];
      (tabla.rows ?? []).forEach((row) => {
        const v = String(row[colIntervaloKey] ?? '').trim();
        if (v && !valores.includes(v)) valores.push(v);
      });
      return valores.length ? valores.join(' / ') : 'Toda la tabla';
    }

    const firstColKey = tabla.columns[0]?.key ?? '';
    return this.formatearValor(this.getValorCelda(tabla, sel.filaIndex, firstColKey));
  }

  private getErrorSeleccionadoParaCmc(cmc: CmcConfiguracionExt, index: number): string {
    const sel = cmc.selecciones[index];
    const tabla = this.filteredTablas[index];
    if (!sel || !tabla) return '';

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const tieneRangos = this.tablaTieneRangosParaCmc(cmc, index);

    const filas = this.obtenerFilasParaCalculo(tabla, sel, colIntervaloKey, tieneRangos);

    if (!filas.length) {
      return this.formatearValor(
        this.getValorCelda(tabla, sel.filaIndex, sel.columnaErrorKey)
      );
    }

    const errorProm = filas.reduce((acc, f) => acc + f.error, 0) / filas.length;
    return this.formatearValor(errorProm);
  }

  private getIncertidumbreSeleccionadaParaCmc(cmc: CmcConfiguracionExt, index: number): string {
    const sel = cmc.selecciones[index];
    const tabla = this.filteredTablas[index];
    if (!sel || !tabla) return '';

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const tieneRangos = this.tablaTieneRangosParaCmc(cmc, index);

    const filas = this.obtenerFilasParaCalculo(tabla, sel, colIntervaloKey, tieneRangos);

    if (!filas.length) {
      return this.formatearValor(
        this.getValorCelda(tabla, sel.filaIndex, sel.columnaIncertidumbreKey)
      );
    }

    const incertidumbreMax = filas.reduce((max, f) => Math.max(max, f.incertidumbre), -Infinity);
    return this.formatearValor(incertidumbreMax);
  }

  private getMinReferenciaParaCmc(cmc: CmcConfiguracionExt, index: number): string {
    const sel = cmc.selecciones[index];
    const tabla = this.filteredTablas[index];
    if (!sel || !tabla) return '—';

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const tieneRangos = this.tablaTieneRangosParaCmc(cmc, index);
    const filas = this.obtenerFilasParaCalculo(tabla, sel, colIntervaloKey, tieneRangos);
    if (!filas.length) return '—';

    let mejor: FilaRangoInfo | null = null;
    for (const f of filas) {
      if (mejor === null || f.valorReferenciaNum < mejor.valorReferenciaNum) {
        mejor = f;
      }
    }
    if (!mejor) return '—';

    return this.formatearValorConTexto(mejor.valorReferenciaRaw, mejor.valorReferenciaNum);
  }

  private getMaxReferenciaParaCmc(cmc: CmcConfiguracionExt, index: number): string {
    const sel = cmc.selecciones[index];
    const tabla = this.filteredTablas[index];
    if (!sel || !tabla) return '—';

    const colIntervaloKey = tabla.columns[0]?.key ?? '';
    const tieneRangos = this.tablaTieneRangosParaCmc(cmc, index);
    const filas = this.obtenerFilasParaCalculo(tabla, sel, colIntervaloKey, tieneRangos);
    if (!filas.length) return '—';

    let mejor: FilaRangoInfo | null = null;
    for (const f of filas) {
      if (mejor === null || f.valorReferenciaNum > mejor.valorReferenciaNum) {
        mejor = f;
      }
    }
    if (!mejor) return '—';

    return this.formatearValorConTexto(mejor.valorReferenciaRaw, mejor.valorReferenciaNum);
  }

  private getDiasDesdeAnteriorParaCmc(cmc: CmcConfiguracionExt, index: number): number | null {
    const tabla = this.filteredTablas[index];
    const cert = this.getCertificado(tabla);
    if (!cert) return null;

    const fechaRaw = cert.date_cal || cert.date_cc;
    const fecha = fechaRaw ? new Date(fechaRaw) : null;
    if (!fecha || isNaN(fecha.getTime())) return null;

    const fechas: { idx: number; fecha: Date }[] = [];

    Object.entries(cmc.selecciones).forEach(([idxStr, s]) => {
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

  // Marcado en las tablas de resultados

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

  private getColorCmc(id: number): { bg: string; border: string; badge: string } {
    if (id <= 0) return this.paletaCmc[0];
    return this.paletaCmc[(id - 1) % this.paletaCmc.length];
  }

  getCmcsDeFila(tableIndex: number, rowIndex: number): number[] {
    const ids = new Set<number>();
    const tabla = this.filteredTablas[tableIndex];
    if (!tabla) return [];

    const colIntervaloKey = tabla.columns[0]?.key ?? '';

    for (const cmc of this.cmcs) {
      const sel = cmc.selecciones[tableIndex];
      if (!sel?.seleccionada) continue;

      const tieneRangos = this.tablaTieneRangosParaCmc(cmc, tableIndex);

      if (!tieneRangos) {
        ids.add(cmc.id);
        continue;
      }

      const rangoObjetivo = String(
        this.getValorCelda(tabla, sel.filaIndex, colIntervaloKey) ?? ''
      ).trim();
      if (!rangoObjetivo) continue;

      const rangoFila = String(
        this.getValorCelda(tabla, rowIndex, colIntervaloKey) ?? ''
      ).trim();

      if (this.normalizarRango(rangoFila) === this.normalizarRango(rangoObjetivo)) {
        ids.add(cmc.id);
      }
    }

    return Array.from(ids);
  }

  private tablaTieneRangosParaCmc(cmc: CmcConfiguracionExt, _index: number): boolean {
    return cmc.todasTienenRangos !== false;
  }

  esPrimeraFilaDelRango(tableIndex: number, rowIndex: number, cmcId: number): boolean {
    const tabla = this.filteredTablas[tableIndex];
    if (!tabla) return false;

    const cmc = this.cmcs.find(c => c.id === cmcId);
    if (!cmc) return false;

    const sel = cmc.selecciones[tableIndex];
    if (!sel?.seleccionada) return false;

    const tieneRangos = this.tablaTieneRangosParaCmc(cmc, tableIndex);

    if (!tieneRangos) {
      return rowIndex === 0;
    }

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

    if (rowIndex === 0) return true;

    const rangoAnterior = String(
      this.getValorCelda(tabla, rowIndex - 1, colIntervaloKey) ?? ''
    ).trim();

    return this.normalizarRango(rangoAnterior) !== this.normalizarRango(rangoObjetivo);
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

      if (colKey === colIntervaloKey)              { classes['cell-rango'] = true; }
      if (colKey === sel.columnaReferenciaKey)     { classes['cell-referencia'] = true; }
      if (colKey === sel.columnaErrorKey)          { classes['cell-error'] = true; }
      if (colKey === sel.columnaIncertidumbreKey)  { classes['cell-incertidumbre'] = true; }

      columnasUsadas.add(sel.columnaReferenciaKey);
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
      if (colKey === sel.columnaReferenciaKey)     return {};
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

  // Parser y normalización de valores de referencia

  private parsearValorReferencia(raw: string): ValorReferenciaParseado {
    const original = String(raw ?? '').trim();

    const match = original.match(/-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/);

    if (!match || match.index === undefined) {
      return { numero: NaN, texto: original, unidadBase: 1, unidadTexto: '' };
    }

    const numStr = match[0];
    const numeroOriginal = Number(numStr.replace(',', '.'));

    const antes = original.slice(0, match.index);
    const despues = original.slice(match.index + numStr.length);
    const textoCompleto = `${antes}${despues}`;

    const unidadMatch = textoCompleto.match(/[a-zA-ZµΩω]+/);
    const unidadTexto = unidadMatch ? unidadMatch[0] : '';

    const factor = this.obtenerFactorUnidad(unidadTexto);
    const numero = isFinite(numeroOriginal) ? numeroOriginal * factor : NaN;

    return {
      numero,
      texto: textoCompleto,
      unidadBase: factor,
      unidadTexto
    };
  }

  private obtenerFactorUnidad(unidadTexto: string): number {
    if (!unidadTexto) return 1;

    const u = unidadTexto.trim();
    const uLower = u.toLowerCase();

    if (/^k/i.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e3 * factorBase;
    }
    if (/^M/.test(u) && !/^m/.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e6 * factorBase;
    }
    if (/^G/i.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e9 * factorBase;
    }
    if (/^m/.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e-3 * factorBase;
    }
    if (/^u|^µ/i.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e-6 * factorBase;
    }
    if (/^n/i.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e-9 * factorBase;
    }
    if (/^p/i.test(u)) {
      const base = uLower.substring(1);
      const factorBase = this.factorUnidadBase(base);
      return 1e-12 * factorBase;
    }

    const baseDirecta = this.factorUnidadBase(uLower);
    if (baseDirecta !== 1 || this.esUnidadBase(uLower)) {
      return baseDirecta;
    }

    return 1;
  }

  private factorUnidadBase(unidad: string): number {
    const u = unidad
      .trim()
      .toLowerCase()
      .replace(/μ/g, 'u')
      .replace(/µ/g, 'u');

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

  private formatearValorConTexto(rawOriginal: string, numeroNormalizado: number): string {
    const original = String(rawOriginal ?? '').trim();
    const match = original.match(/-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/);

    if (!match || match.index === undefined) {
      return original;
    }

    const antes = original.slice(0, match.index);
    const despues = original.slice(match.index + match[0].length);
    const textoSinNumero = `${antes}${despues}`;

    if (textoSinNumero.trim() === '') {
      return match[0];
    }

    return original;
  }

  // Normalización de rango

  private normalizarRango(v: string): string {
    return String(v ?? '')
      .replace(/\s+/g, '')
      .replace(/±/g, '')
      .toLowerCase();
  }

  // 🔍 DIAGNÓSTICO PT: log del payload que se va a enviar
  private logPayloadEnvio(contexto: string, resumen?: Record<number, ResumenTablaCmc[]>): void {
    const payloads = this.cmcsParaMostrar;

    console.groupCollapsed(
      `%c[CMC → ENVÍO] ${contexto}`,
      'color:#0d6efd;font-weight:bold;font-size:12px;'
    );

    console.log('Equipo:', this.selectedEquipmentId);
    console.log('Mensurando:', this.etiquetaMensurando);
    console.log('CMC calculados:', payloads.length);

    payloads.forEach((p, i) => {
      console.log(`CMC #${p.cmcNumero} (índice ${i}) → pt="${p.pt}" (tipo ${typeof p.pt})`);
      console.log('payload COMPLETO:', JSON.parse(JSON.stringify(p)));
    });

    console.log('--- payloadTexto ---');
    console.log(this.textoPayloadCompleto);

    const estadoFinal: any = {
      payload: this.payloadCompleto,
      equipmentId: this.selectedEquipmentId,
      mensurando: this.etiquetaMensurando
    };
    if (resumen) estadoFinal.resumenTablas = resumen;

    console.log('--- router.state FINAL ---');
    console.log(JSON.parse(JSON.stringify(estadoFinal)));
    console.groupEnd();
  }

  // Cálculo de todos los CMC

  calcularTodosLosCmc(): void {
    if (!this.cmcs.length) {
      this.alert.warning('No hay cálculos de CMC creados.');
      return;
    }

    const exitosos: number[] = [];
    const fallidos: { id: number; motivo: string }[] = [];
    const ptCorrupto: { id: number; detalle: string }[] = [];

    for (const cmc of this.cmcs) {
      const resultado = this.calcularCmcInterno(cmc);
      if (resultado.ok) {
        exitosos.push(cmc.id);
      } else if (resultado.ptInconsistente) {
        ptCorrupto.push({ id: cmc.id, detalle: resultado.motivo ?? 'PT inconsistente' });
      } else {
        fallidos.push({ id: cmc.id, motivo: resultado.motivo ?? 'Error desconocido' });
      }
    }

    // 🔧 NG0103: recalcular caché UNA vez, fuera de getters
    this.recalcularCachePayloads();
    this.refresh();

    // 🔍 DIAGNÓSTICO PT
    console.log(
      '%c[CMC → POST-CÁLCULO] pt por CMC:',
      'color:#198754;font-weight:bold;',
      this.cmcsParaMostrar.map(p => ({ cmc: p.cmcNumero, pt: p.pt }))
    );

    if (ptCorrupto.length) {
      const detalle = ptCorrupto
        .map(p => `CMC #${p.id}: ${p.detalle}`)
        .join(' | ');
      this.alert.error(
        `Datos corruptos: los certificados involucrados no tienen el mismo PT (patrón de referencia). ` +
        `Revise los certificados antes de calcular. Detalle: ${detalle}`,
        'Datos corruptos – PT inconsistente'
      );
      return;
    }

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

  private calcularCmcInterno(cmc: CmcConfiguracionExt): {
    ok: boolean;
    motivo?: string;
    ptInconsistente?: boolean;
  } {
    const limpiar = () => {
      cmc.payload = null;
      cmc.payloadTexto = '';
    };

    if (!cmc.intervaloCalibracion || cmc.intervaloCalibracion <= 0) {
      limpiar();
      return {
        ok: false,
        motivo: 'intervalo de calibración inválido (el campo está en 0 o vacío)'
      };
    }

    const entradas = Object.entries(cmc.selecciones)
      .map(([idx, s]) => ({ idx: Number(idx), s }))
      .filter(({ s }) => s.seleccionada);

    if (entradas.length < 2) {
      limpiar();
      return { ok: false, motivo: 'menos de 2 tablas seleccionadas' };
    }

    const rangosNormalizados = new Set<string>();
    const colIntervaloPorTabla: Record<number, string> = {};
    const tieneRangosPorTabla: Record<number, boolean> = {};

    for (const { idx, s } of entradas) {
      const tabla = this.filteredTablas[idx];
      if (!tabla) {
        limpiar();
        return { ok: false, motivo: `tabla #${idx + 1}: no encontrada` };
      }

      const colIntervaloKey = tabla.columns[0]?.key ?? '';
      colIntervaloPorTabla[idx] = colIntervaloKey;

      const tieneRangos = this.tablaTieneRangosParaCmc(cmc, idx);
      tieneRangosPorTabla[idx] = tieneRangos;

      if (!tieneRangos) continue;

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

    const primeraConRangos = entradas.find(({ idx }) => tieneRangosPorTabla[idx]);
    const rangoObjetivo = primeraConRangos
      ? String(
          this.getValorCelda(
            this.filteredTablas[primeraConRangos.idx],
            primeraConRangos.s.filaIndex,
            colIntervaloPorTabla[primeraConRangos.idx]
          ) ?? ''
        ).trim()
      : '';

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
      pt: string;
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
      const tieneRangos = tieneRangosPorTabla[idx];

      const filasRango = this.obtenerFilasParaCalculo(
        tabla, s, colIntervaloKey, tieneRangos
      );

      if (!filasRango.length) {
        invalidos.push(
          tieneRangos
            ? `tabla #${idx + 1}: no hay filas con el rango "${rangoObjetivo}"`
            : `tabla #${idx + 1}: no hay filas válidas en la tabla`
        );
        continue;
      }

      const n = filasRango.length;
      const sumaError = filasRango.reduce((acc, f) => acc + f.error, 0);
      const errorProm = sumaError / n;

      const incertidumbreMax = filasRango.reduce(
        (max, f) => Math.max(max, f.incertidumbre), -Infinity
      );

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
        : (tieneRangos ? rangoObjetivo : '—');

      const maxRef = filaMax
        ? this.formatearValorConTexto(filaMax.valorReferenciaRaw, filaMax.valorReferenciaNum)
        : (tieneRangos ? rangoObjetivo : '—');

      // 🔍 DIAGNÓSTICO PT
      const ptRaw = cert.pt ?? cert.procedimiento_tecnico;
      const pt = (ptRaw === null || ptRaw === undefined)
        ? ''
        : String(ptRaw).trim();

      console.log(
        `%c[CMC → CALC] tabla #${idx + 1} cc=${cert.cc || tabla.cc_id} → cert.pt=${cert.pt} | cert.procedimiento_tecnico=${cert.procedimiento_tecnico} | pt usado=${pt}`,
        'color:#6c757d;'
      );

      filasValidas.push({
        idx,
        tabla,
        cert,
        fecha,
        error: errorProm,
        incertidumbre: incertidumbreMax,
        cc: cert.cc || tabla.cc_id || '',
        table_id: tabla.table_id || '',
        rango: tieneRangos ? rangoObjetivo : 'Toda la tabla',
        minRef,
        maxRef,
        nRegistros: n,
        pt
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

    const ptsRaw = filasValidas.map(x => x.pt);
    const ptsSinVaciar = ptsRaw.filter(p => p !== '');

    if (ptsSinVaciar.length !== ptsRaw.length) {
      limpiar();
      return {
        ok: false,
        ptInconsistente: true,
        motivo: 'hay certificados sin PT definido'
      };
    }

    const ptUnico = ptsSinVaciar[0];
    const todosMismoPt = ptsSinVaciar.every(p => p === ptUnico);

    if (!todosMismoPt) {
      const distintos = Array.from(new Set(ptsSinVaciar)).join(', ');
      limpiar();
      return {
        ok: false,
        ptInconsistente: true,
        motivo: `PTs distintos: ${distintos}`
      };
    }

    const ptPayload = ptUnico;

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

    const payload: CmcPayload = {
      id: this.selectedEquipmentId,
      pt: ptPayload,
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
      `#pt ${p.pt}`,
      `#Cálculo de la CMC para un valor de referencia en el intervalo de calibración`,
      ``,
      `#Certificados involucrados: ${p.certificados.join(', ')}`,
      ``,
      `#Entradas:`,
      ``,
      `errores=${fmt(p.errores)} #Promedio de errores por certificado (mismo rango)`,
      `incertidumbres=${fmt(p.incertidumbres)} #Incertidumbre máxima por certificado (mismo rango)`,
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

  // Integración con el componente de resultados

  // 🔧 NG0103: pura, sin mutar cmcActivoId
  public obtenerResumenValoresSeleccionados(): Record<number, ResumenTablaCmc[]> {
    const resumenes: Record<number, ResumenTablaCmc[]> = {};

    for (const cmc of this.cmcs) {
      const filas: ResumenTablaCmc[] = [];

      this.filteredTablas.forEach((tabla, i) => {
        if (!cmc.selecciones[i]?.seleccionada) return;

        filas.push({
          index: i + 1,
          cc: tabla.cc_id || '—',
          fila: this.tablaTieneRangosParaCmc(cmc, i)
            ? String((cmc.selecciones[i].filaIndex ?? 0) + 1)
            : 'Toda la tabla',
          intervalo: this.getRangoSeleccionadoParaCmc(cmc, i),
          refMin: this.getMinReferenciaParaCmc(cmc, i),
          refMax: this.getMaxReferenciaParaCmc(cmc, i),
          dias: this.getDiasDesdeAnteriorParaCmc(cmc, i),
          sesgo: this.getErrorSeleccionadoParaCmc(cmc, i),
          incertidumbre: this.getIncertidumbreSeleccionadaParaCmc(cmc, i)
        });
      });

      resumenes[cmc.id] = filas;
    }

    return resumenes;
  }

  async calcularYMostrarCmc(): Promise<void> {
    if (!this.cmcs.length) {
      this.alert.warning('No hay cálculos de CMC creados.');
      return;
    }

    const confirmado = await this.confirmarParametrosDelCalculo();
    if (!confirmado) {
      return;
    }

    try {
      this.calcularTodosLosCmc();
    } catch (e) {
      console.error('[Cmcparamsvf] Excepción en calcularTodosLosCmc:', e);
      this.alert.error(
        'Ocurrió un error inesperado al calcular los CMC. Revisa la consola.',
        'Error'
      );
      return;
    }

    const payloads = this.cmcsParaMostrar;
    if (!payloads.length) {
      this.alert.warning(
        'No hay ningún CMC válido calculado todavía. Revisa las tablas seleccionadas.',
        'Sin resultados'
      );
      return;
    }

    // Calcular el resumen UNA vez (fuera del log y fuera de cualquier getter)
    const resumenTablas = this.obtenerResumenValoresSeleccionados();

    // 🔍 DIAGNÓSTICO PT
    this.logPayloadEnvio('Antes de router.navigate', resumenTablas);

    const navegacionOk = await this.router.navigate([this.rutaResultadosCmc], {
      state: {
        payload: this.payloadCompleto,
        equipmentId: this.selectedEquipmentId,
        mensurando: this.etiquetaMensurando,
        resumenTablas
      }
    });

    if (!navegacionOk) {
      this.alert.error(
        'No se pudo abrir la vista de resultados del CMC.',
        'Error de navegación'
      );
    }
  }

  private async confirmarParametrosDelCalculo(): Promise<boolean> {
    try {
      return await this.alert.confirm(
        'Revise que los parámetros ingresados sean correctos antes de continuar:\n' +
        '• Tablas seleccionadas\n' +
        '• Fila / rango seleccionado (o "Sin rangos" si aplica)\n' +
        '• Columnas de error, incertidumbre y referencia\n' +
        '• Intervalo de calibración (meses)\n\n' +
        '¿Está seguro de proceder con el cálculo del CMC?',
        'Confirmar cálculo del CMC'
      );
    } catch (e) {
      console.error('[Cmcparamsvf] Error al mostrar la confirmación:', e);
      return false;
    }
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

  // Ayuda contextual (3 bloques)

  ayuda(modal: string): void {
    const clave = String(modal ?? '').trim().toLowerCase();

    let detalle = '';

    if (clave === 'equipo') {
      detalle = `
        <h3 style="margin-top:0; color:#0d6efd;">1. Selección del instrumento</h3>
        <p>Antes de calcular la CMC debes identificar <b>qué instrumento</b> estás analizando. Para ello se utilizan tres selectores jerárquicos:</p>
        <ol>
          <li>
            <b>Equipo:</b> selecciona el <i>Equipment ID</i> del instrumento (por ejemplo, un multímetro, un calibrador, una fuente, etc.).
            Al cambiar de equipo se descargan sus tablas de resultados y se limpian los filtros.
          </li>
          <li>
            <b>Título (Mensurando):</b> es la magnitud general que se está midiendo.
            <br><em>Ejemplos:</em> <code>DC Voltage</code>, <code>AC Voltage</code>, <code>Resistance</code>, <code>Frequency</code>, etc.
          </li>
          <li>
            <b>Mesurando / Parámetro:</b> es la variante específica dentro del título.
            <br><em>Ejemplo:</em> si el título es <code>AC Voltage</code>, los parámetros pueden ser <code>RMS Voltage</code> o <code>Peak-to-Peak Voltage (PP)</code>.
          </li>
        </ol>
        <p>Cuando seleccionas el título, se filtran automáticamente las tablas disponibles y se cargan los certificados asociados a cada <code>cc_id</code>.</p>
        <p style="color:#6c757d; font-size:0.9em;"><i>Sugerencia: si no ves tu título/parámetro, prueba con la opción <b>Other</b> al final de cada lista.</i></p>
      `;
    } else if (clave === 'cmc') {
      detalle = `
        <h3 style="margin-top:0; color:#198754;">2. Cálculo de la CMC</h3>
        <p>La <b>CMC (Calibración por Mínimos Cuadrados / Capacidad de Medición y Calibración)</b> estima cómo evoluciona el error del instrumento a lo largo del tiempo, usando los certificados de calibración históricos.</p>
        <p><b>Objetivo:</b> obtener la incertidumbre combinada del instrumento en un intervalo de calibración, para un rango de referencia dado. El resultado es un <i>payload</i> con:</p>
        <ul>
          <li><b>pt:</b> patrón de referencia (debe ser el mismo en todos los certificados).</li>
          <li><b>errores:</b> promedio del error por cada certificado (un valor por certificado).</li>
          <li><b>incertidumbres:</b> incertidumbre máxima por certificado.</li>
          <li><b>tiempo.intermedio:</b> días transcurridos entre calibraciones consecutivas.</li>
          <li><b>intervalo.calibracion:</b> intervalo declarado (en meses).</li>
          <li><b>rango / min.referencia / max.referencia:</b> rango trabajado.</li>
        </ul>
        <p><b>Requisitos:</b></p>
        <ul>
          <li>Seleccionar al menos <b>2 tablas</b> (cada tabla corresponde a un certificado).</li>
          <li>Cada tabla debe tener certificado con fecha válida.</li>
          <li>Todos los certificados deben tener el <b>mismo PT</b> (patrón de referencia). Si no coinciden, se mostrará una alerta de datos corruptos.</li>
          <li>Debe existir una columna de <b>error</b>, una de <b>incertidumbre</b> y una de <b>referencia</b>.</li>
        </ul>
        <p>Puedes crear varios CMC con el botón <b>Nuevo CMC</b>; cada uno se calcula con su propia configuración y se identifica por número (CMC #1, CMC #2, …).</p>
        <p style="color:#6c757d; font-size:0.9em;"><i>El payload generado se muestra en el panel inferior y puede copiarse al portapapeles.</i></p>
      `;
    } else if (clave === 'tablas') {
      detalle = `
        <h3 style="margin-top:0; color:#fd7e14;">3. Selección en las tablas (resaltado)</h3>
        <p>En la tabla de resultados, cada fila representa un punto de medición. Para cada tabla debes indicar:</p>
        <ol>
          <li><b>¿Tiene rangos / intervalos de medida?</b>
            <ul>
              <li><b>Sí</b> (por defecto): el CMC se calcula <i>solo con las filas del rango seleccionado</i>. El desplegable muestra únicamente los rangos distintos.</li>
              <li><b>No</b>: la tabla completa se usa como un único bloque. Esto aplica a instrumentos que con un mismo rango cubren toda la escala. En este caso la selección de fila se desactiva.</li>
              <li>Este interruptor es <b>global</b>: al activarlo/desactivarlo se aplica a <i>todas</i> las tablas del CMC.</li>
            </ul>
          </li>
          <li><b>Fila / rango:</b> si la tabla tiene rangos, selecciona uno de los rangos distintos que aparecen en el desplegable. El sistema agrupa automáticamente las filas que comparten el mismo intervalo.</li>
          <li><b>Columnas:</b> se detectan automáticamente las columnas de <b>error</b>, <b>incertidumbre</b> y <b>referencia</b>. Puedes cambiarlas manualmente si la detección falla.</li>
        </ol>
        <p><b>Colores del resaltado:</b></p>
        <ul>
          <li><span style="display:inline-block;width:14px;height:14px;background:#0d6efd;vertical-align:middle;border-radius:3px;"></span> <b>Azul</b>: CMC #1</li>
          <li><span style="display:inline-block;width:14px;height:14px;background:#198754;vertical-align:middle;border-radius:3px;"></span> <b>Verde</b>: CMC #2</li>
          <li><span style="display:inline-block;width:14px;height:14px;background:#ffc107;vertical-align:middle;border-radius:3px;"></span> <b>Amarillo</b>: CMC #3</li>
          <li><span style="display:inline-block;width:14px;height:14px;background:#dc3545;vertical-align:middle;border-radius:3px;"></span> <b>Rojo</b>: CMC #4</li>
          <li>… y así sucesivamente con la paleta cíclica.</li>
        </ul>
        <p>Las celdas <b>no usadas</b> por ningún CMC se muestran atenuadas (clase <code>cell-no-usada</code>).</p>
      `;
    } else {
      detalle = `
        <p>No hay ayuda disponible para <code>${this.escapeHtml(clave)}</code>.</p>
        <p>Bloques disponibles: <code>equipo</code>, <code>cmc</code>, <code>tablas</code>.</p>
      `;
    }

    this.alert.alert(detalle, 'Información', {
      type: 'info',
      confirmText: 'Sí, entendido',
      dismissible: true,
      size: 'xl',
      sizeOptions: {
        width: '1200px',
        maxWidth: '95vw',
        maxHeight: '85vh',
        scrollable: true,
        messageMaxHeight: '60vh',
        fontSize: '15px',
        lineHeight: 1.6,
      },
    });
  }

  private escapeHtml(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Utilidades

  private refresh(): void {
    this.cdr.markForCheck();
  }
}
