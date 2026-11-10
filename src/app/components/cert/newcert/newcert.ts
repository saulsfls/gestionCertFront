import {
  Component,
  OnInit,
  ChangeDetectorRef,
  inject,
  PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs/operators';
import { Certificado, ResultTable, Column } from '../../../models/certificado.models';
import { CertService } from '../../../services/database/cert.service';
import { ImageService } from '../../../services/database/image.service';
import { AlertService } from '../../../services/core/alert.service';
import { PtService } from '../../../services/database/pt.service';
import { EquipmentService, PatronCruzado } from '../../../services/database/equipment.service';
import {
  ImageCropperComponent,
  ImageCroppedEvent,
  LoadedImage
} from 'ngx-image-cropper';
import { AuthService } from '../../../services/auth/auth.service';

export type DireccionTab = 'horizontal' | 'vertical';
export type JsonPrimitiveType = 'string' | 'number' | 'boolean';
export type TipoDato = 'number' | 'string';

interface TableImageState {
  imageChangedEvent: Event | null;
  pasteImageFile: File | undefined;
  croppedImageBase64: string;
  cargando: boolean;
  tieneEncabezado: boolean;
}

/** Interfaz para el selector del componente */
interface PatronOption {
  id: string;              // ID compuesto (ej. "849-0000")
  name: string;            // Nombre real cruzado (ej. "Multímetro Digital")
  pts: string[];           // Lista de PTs asociados
  calibration_date?: string;   // <-- Añadir
  months_calibration?: number;
}

@Component({
  selector: 'app-newcert',
  standalone: true,
  imports: [FormsModule, CommonModule, ImageCropperComponent],
  templateUrl: './newcert.html',
  styleUrl: './newcert.css',
})
export class Newcert implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private imageService = inject(ImageService);
  private alert = inject(AlertService);
  private auth = inject(AuthService);
  private ptService = inject(PtService);
  private equipmentService = inject(EquipmentService);
  isBrowser: boolean = isPlatformBrowser(this.platformId);

  // ========== PATRONES (selector) ==========
  patrones: PatronOption[] = [];
  cargandoPatrones: boolean = false;
  patronSeleccionado: PatronOption | null = null;

  // ========== CATÁLOGO DE PT ==========
  private ptDescripcionPorId = new Map<string, string>();

  opcionesTitulo: string[] = [
    'DC Voltage', 'AC Voltage', 'DC Current', 'AC Current', 'Resistance',
    '4-Wire Resistance', 'Lightning Impulse Voltage (LI)', 'Switching Impulse Voltage (SI)',
    'Frequency', 'Capacitance', 'Other'
  ];

  private opcionesParametroPorTitulo: Record<string, string[]> = {
    'DC Voltage': ['Voltage'],
    'AC Voltage': ['RMS Voltage', 'Peak-to-Peak Voltage (PP)'],
    'DC Current': ['Current'],
    'AC Current': ['RMS Current', 'Peak-to-Peak Current (PP)'],
    'Resistance': ['Resistance'],
    '4-Wire Resistance': ['4-Wire Resistance'],
    'Lightning Impulse Voltage (LI)': [
      'LI Impulse Voltage', 'Determination of scale factor and measurement of Ut',
      'Measurement of front time T1', 'Measurement of time to half value T2', 'Polarity Linearity Test'
    ],
    'Switching Impulse Voltage (SI)': [
      'LI Impulse Voltage', 'Determination of scale factor and measurement of Ut',
      'Measurement of front time T1', 'Measurement of time to half value T2', 'Polarity Linearity Test'
    ],
    'Frequency': ['Frequency'],
    'Capacitance': ['Capacitance'],
    'Other': []
  };

  certificado: Certificado = {
    equipment_id: '', name_equipment: '', cc: '', id_user: '',
    date_cal: '', date_cc: '', calibration_interval: 0, resolution: 0,
    entity: '', cert_type: '', comments: '', active: true, data: {}
  };

  resultTables: ResultTable[] = [];
  direccionTab: DireccionTab = 'vertical';
  jsonInputText: string = '';
  copiadoExitoso: boolean = false;
  guardando: boolean = false;
  imageStates: TableImageState[] = [];
  ocrEnProceso: boolean = false;

  constructor(
    private certificadoService: CertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.resultTables = [this.crearEstructuraTablaInicial()];
    this.imageStates = [this.crearEstadoImagenVacio()];
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
    this.cargarPatrones();
  }

  // ========== CARGA DE DATOS ==========
  cargarPatrones(): void {
    this.cargandoPatrones = true;

    // Cargamos el catálogo de PT para las descripciones
    this.ptService.obtenerPt().subscribe({
      next: (ptRaw: any[]) => {
        this.ptDescripcionPorId.clear();
        for (const pt of ptRaw ?? []) {
          const id = String(pt?.id ?? pt?.pt ?? '').trim();
          if (!id) continue;
          const desc = String(pt?.description ?? pt?.name ?? pt?.descripcion ?? '').trim();
          this.ptDescripcionPorId.set(id, desc || id);
        }
        this.cargarPatronesCruzados();
      },
      error: (err) => {
        console.error('Error cargando catálogo PT:', err);
        this.cargarPatronesCruzados();
      }
    });
  }

  private cargarPatronesCruzados(): void {
    // Usamos el método getPatronesCruzados() que ya hace el forkJoin y el cruce
    this.equipmentService.getPatronesCruzados().subscribe({
      next: (patronesCruzados: PatronCruzado[]) => {
        this.patrones = this.agruparPatronesPorId(patronesCruzados);
        this.cargandoPatrones = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando patrones:', err);
        this.cargandoPatrones = false;
        this.alert.error('No se pudieron cargar los patrones.', 'Error de carga');
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Toma los patrones cruzados (que pueden estar repetidos por tener varios PTs)
   * y los agrupa por ID, juntando todos sus PTs en un arreglo.
   */
  private agruparPatronesPorId(patronesCruzados: PatronCruzado[]): PatronOption[] {
    const mapa = new Map<string, { name: string; pts: Set<string>; calDate?: string; months?: number }>();

    for (const p of patronesCruzados) {
      const id = String(p.id || '').trim();
      if (!id) continue;

      if (!mapa.has(id)) {
        mapa.set(id, {
          name: p.name || id,
          pts: new Set<string>(),
          calDate: p.calibration_date,            // <-- Guardar fecha
          months: p.months_calibration            // <-- Guardar intervalo
        });
      }

      if (p.pt) {
        mapa.get(id)!.pts.add(String(p.pt).trim());
      }
    }

    return Array.from(mapa.entries())
      .map(([id, v]) => ({
        id,
        name: v.name,
        pts: Array.from(v.pts).sort((a, b) => a.localeCompare(b, 'es')),
        calibration_date: v.calDate,
        months_calibration: v.months
      }))
      .sort((a, b) => a.id.localeCompare(b.id, 'es'));
  }

  // ========== HELPERS DE PT / PATRÓN ==========
  descripcionPt(ptId: string): string {
    if (!ptId) return '';
    return this.ptDescripcionPorId.get(ptId) ?? ptId;
  }

  get patronTienePts(): boolean {
    return (this.patronSeleccionado?.pts?.length ?? 0) > 0;
  }

  get ptsDelPatron(): string[] {
    return this.patronSeleccionado?.pts ?? [];
  }

  get hayPatronSeleccionado(): boolean {
    return this.patronSeleccionado !== null;
  }

  ptsDisponiblesParaTabla(_table: ResultTable): string[] {
    return this.ptsDelPatron;
  }

  onPatronChange(): void {
    const id = (this.certificado.equipment_id || '').trim();
    const patron = this.patrones.find(p => p.id === id) ?? null;
    this.patronSeleccionado = patron;

    if (!patron) {
      this.certificado.name_equipment = '';
      this.certificado.date_cal = '';
      this.certificado.calibration_interval = 0;
      this.sincronizarJsonTexto();
      this.cdr.detectChanges();
      return;
    }

    // El nombre ya viene cruzado desde el servicio
    this.certificado.name_equipment = patron.name || '';

    // Usamos las propiedades directas de PatronOption
    this.certificado.date_cal = patron.calibration_date ?? '';
    this.certificado.calibration_interval = Number(patron.months_calibration) || 0;

    for (const table of this.resultTables) {
      if (table.pt && !patron.pts.includes(table.pt)) {
        table.pt = '';
      }
    }

    this.regenerarTableIds();
    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
  }

  onTablePtChange(table: ResultTable, ptId: string): void {
    table.pt = (ptId || '').trim();
    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
  }

  // ========== 🔑 GENERACIÓN DE table_id ==========
  private construirTableId(indexTable: number): string {
    const folio = (this.certificado.cc || '').trim();
    const sufijo = `T${indexTable + 1}`;
    return folio ? `${folio}-${sufijo}` : sufijo;
  }

  private regenerarTableIds(): void {
    const folio = (this.certificado.cc || '').trim();
    const equipo = this.certificado.equipment_id || '';

    this.resultTables.forEach((table, i) => {
      table.table_id = this.construirTableId(i);
      table.cc_id = folio;
      table.equipment_id = equipo;
    });
  }

  // ========== ESTADO DE IMAGEN ==========
  private crearEstadoImagenVacio(): TableImageState {
    return {
      imageChangedEvent: null, pasteImageFile: undefined, croppedImageBase64: '',
      cargando: false, tieneEncabezado: true
    };
  }

  // ========== ESTRUCTURA INICIAL ==========
  private crearEstructuraTablaInicial(): ResultTable {
    return {
      title: 'DC Voltage', equipment_id: this.certificado.equipment_id || '',
      cc_id: this.certificado.cc || '', pt: '', table_id: '',
      parameter: this.obtenerOpcionesParametro('DC Voltage')[0] || 'Voltage',
      unit: '', calibration_equation: '', range: '', comments: '',
      columns: [{ key: 'key', label: 'Label', unit: 'Units', type: 'number' }],
      rows: [{}]
    };
  }

  // ========== JSON ==========
  sincronizarJsonTexto(): void {
    this.jsonInputText = this.obtenerJsonString();
  }

  onTableChange(): void {
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
  }

  onCcChange(): void {
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
  }

  esTituloPredefinido(title: string): boolean {
    return this.opcionesTitulo.slice(0, -1).includes(title);
  }

  obtenerOpcionesParametro(title: string): string[] {
    return this.opcionesParametroPorTitulo[title] || [];
  }

  actualizarParametroSegunTitulo(table: ResultTable): void {
    const opciones = this.obtenerOpcionesParametro(table.title);
    if (opciones.length > 0 && !opciones.includes(table.parameter)) {
      table.parameter = opciones[0];
    }
  }

  private validarKey(key: string, table: ResultTable, columnaActual?: Column): { valido: boolean; mensaje?: string } {
    const keyLimpio = key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!keyLimpio) return { valido: false, mensaje: 'El key no puede estar vacío.' };
    if (!/^[a-z0-9_]+$/.test(keyLimpio)) return { valido: false, mensaje: 'El key solo puede contener letras, números y guión bajo.' };

    for (const col of table.columns) {
      if (columnaActual && col === columnaActual) continue;
      if (col.key === keyLimpio) return { valido: false, mensaje: `El key "${keyLimpio}" ya existe en esta tabla.` };
    }
    return { valido: true };
  }

  // ========== CARGAR DESDE JSON ==========
  actualizarFormularioDesdeJson(): void {
    try {
      const parsedJson = JSON.parse(this.jsonInputText);
      if (!parsedJson || typeof parsedJson !== 'object' || !Array.isArray(parsedJson['Result Tables'])) {
        throw new Error('El JSON debe contener la propiedad "Result Tables" como un arreglo.');
      }

      const tablasNuevas: ResultTable[] = parsedJson['Result Tables'].map((t: any, index: number) => {
        if (!Array.isArray(t.columns) || !Array.isArray(t.rows)) {
          throw new Error(`Estructura inválida en la Tabla #${index + 1}. Debe incluir "columns" y "rows".`);
        }
        return {
          title: t.title || '', equipment_id: t.equipment_id || this.certificado.equipment_id || '',
          cc_id: t.cc || t.cc_id || this.certificado.cc || '', pt: t.pt || '',
          table_id: t.table_id || '', parameter: t.parameter || '', unit: t.unit || '',
          calibration_equation: t.calibration_equation || '', range: t.range || '', comments: t.comments || '',
          columns: t.columns, rows: t.rows
        };
      });

      if (tablasNuevas.length === 0) throw new Error('Debe incluir al menos una tabla.');

      this.resultTables = tablasNuevas;
      this.imageStates = tablasNuevas.map(() => this.crearEstadoImagenVacio());
      this.regenerarTableIds();
      this.sincronizarJsonTexto();
      this.cdr.detectChanges();
      this.alert.success('Las tablas han sido actualizadas desde el JSON.', 'JSON aplicado');
    } catch (err: any) {
      this.alert.error(err?.message ?? 'JSON inválido', 'Error al parsear JSON');
    }
  }

  // ========== NAVEGACIÓN TAB ==========
  onTabKeydown(event: Event, tableIndex: number, rowIndex: number, colIndex: number): void {
    if (this.direccionTab === 'horizontal') return;
    const keyEvent = event as KeyboardEvent;
    keyEvent.preventDefault();
    const direction = keyEvent.shiftKey ? -1 : 1;
    const siguienteFilaIndex = rowIndex + direction;
    const targetId = `input-${tableIndex}-${siguienteFilaIndex}-${colIndex}`;
    const targetInput = document.getElementById(targetId) as HTMLInputElement;
    if (targetInput) { targetInput.focus(); targetInput.select(); }
  }

  // ========== GESTIÓN DE TABLAS ==========
  agregarTabla(): void {
    this.resultTables.push(this.crearEstructuraTablaInicial());
    this.imageStates.push(this.crearEstadoImagenVacio());
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
  }

  eliminarTabla(indexTable: number): void {
    if (this.resultTables.length > 1) {
      this.resultTables.splice(indexTable, 1);
      this.imageStates.splice(indexTable, 1);
      this.regenerarTableIds();
      this.sincronizarJsonTexto();
    }
  }

  // ========== GESTIÓN DE COLUMNAS ==========
  agregarColumna(table: ResultTable): void {
    const id = table.columns.length + 1;
    const nuevaKey = `column_${id}`;
    table.columns.push({ key: nuevaKey, label: `New Column ${id}`, unit: '', type: 'number' });
    table.rows.forEach(row => { row[nuevaKey] = null; });
    this.sincronizarJsonTexto();
  }

  eliminarColumna(table: ResultTable, indexColumn: number): void {
    if (table.columns.length <= 1) return;
    const keyAEliminar = table.columns[indexColumn].key;
    table.columns.splice(indexColumn, 1);
    table.rows.forEach(row => { delete row[keyAEliminar]; });
    this.sincronizarJsonTexto();
  }

  actualizarKeyColumna(col: Column, nuevaKeyRaw: string, table: ResultTable): void {
    const nuevaKey = nuevaKeyRaw.trim().toLowerCase().replace(/\s+/g, '_');
    const viejaKey = col.key;
    if (!nuevaKey || nuevaKey === viejaKey) return;

    const resultado = this.validarKey(nuevaKey, table, col);
    if (!resultado.valido) {
      this.alert.error(resultado.mensaje ?? 'Key inválido', 'Key inválido');
      col.key = viejaKey;
      return;
    }

    col.key = nuevaKey;
    table.rows.forEach(row => {
      row[nuevaKey] = row[viejaKey] ?? null;
      delete row[viejaKey];
    });
    this.sincronizarJsonTexto();
  }

  cambiarTipoDato(_col: Column, _table: ResultTable): void {
    this.sincronizarJsonTexto();
  }

  // ========== GESTIÓN DE FILAS ==========
  agregarFila(table: ResultTable): void {
    const nuevaFila: Record<string, any> = {};
    table.columns.forEach(col => { nuevaFila[col.key] = null; });
    table.rows.push(nuevaFila);
    this.sincronizarJsonTexto();
  }

  eliminarFila(table: ResultTable, indexRow: number): void {
    if (table.rows.length > 1) {
      table.rows.splice(indexRow, 1);
      this.sincronizarJsonTexto();
    }
  }

  // ========== HELPERS NUMÉRICOS ==========
  esNumeroValido(s: string): boolean {
    const t = (s ?? '').trim();
    if (!t) return false;
    return /^-?(?:\d+[.,]?\d*|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(t);
  }

  esValorInvalido(valor: any, col: Column): boolean {
    if (col.type !== 'number') return false;
    if (valor === null || valor === undefined) return false;
    if (typeof valor === 'number') return !isFinite(valor);
    if (String(valor).trim() === '') return false;
    return !this.esNumeroValido(String(valor));
  }

  // ========== HELPERS DE FECHA ==========
  private parseFechaLocal(fecha: string | Date | null | undefined): Date | null {
    if (!fecha) return null;
    if (fecha instanceof Date) return isNaN(fecha.getTime()) ? null : fecha;
    const str = String(fecha).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(str);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  private hoyLocal(): Date {
    const h = new Date();
    h.setHours(0, 0, 0, 0);
    return h;
  }

  private diasEntre(a: Date, b: Date): number {
    const MS = 1000 * 60 * 60 * 24;
    return Math.round((b.getTime() - a.getTime()) / MS);
  }

  // ========== MÉTODOS DE IMAGEN ==========
  onPaste(event: ClipboardEvent, tableIndex: number): void {
    if (!this.isBrowser) return;
    const state = this.imageStates[tableIndex];
    if (!state) return;
    const items = event.clipboardData?.items;
    if (!items) return;

    let imagenEncontrada = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          state.imageChangedEvent = null;
          state.croppedImageBase64 = '';
          state.pasteImageFile = new File([file], `pasted_image_${Date.now()}.png`, { type: file.type });
          this.cdr.detectChanges();
          imagenEncontrada = true;
        }
        break;
      }
    }
    if (!imagenEncontrada) this.alert.warning('El contenido pegado no es una imagen válida.');
  }

  fileChangeEvent(event: Event, tableIndex: number): void {
    const state = this.imageStates[tableIndex];
    if (!state) return;
    state.pasteImageFile = undefined;
    state.croppedImageBase64 = '';
    state.imageChangedEvent = event;
  }

  imageCropped(event: ImageCroppedEvent, tableIndex: number): void {
    const state = this.imageStates[tableIndex];
    if (!state) return;
    if (event.base64) {
      state.croppedImageBase64 = event.base64;
    } else if (event.objectUrl && this.isBrowser) {
      this.blobToBase64(event.objectUrl).then(base64 => {
        state.croppedImageBase64 = base64;
        this.cdr.detectChanges();
      });
    }
  }

  imageLoaded(_image?: LoadedImage): void { this.cdr.detectChanges(); }
  cropperReady(): void { /* listo */ }
  loadImageFailed(_tableIndex?: number): void { this.alert.error('Error al cargar la imagen. Intenta con otra captura o archivo.'); }

  cancelarImagen(tableIndex: number): void {
    const state = this.imageStates[tableIndex];
    if (!state) return;
    state.imageChangedEvent = null;
    state.pasteImageFile = undefined;
    state.croppedImageBase64 = '';
    state.cargando = false;
    this.cdr.detectChanges();
  }

  private blobToBase64(blobUrl: string): Promise<string> {
    if (!this.isBrowser) return Promise.resolve('');
    return fetch(blobUrl).then(r => r.blob()).then(
      blob => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      })
    );
  }

  enviarANode(tableIndex: number): void {
    const state = this.imageStates[tableIndex];
    const table = this.resultTables[tableIndex];
    if (!state || !table) return;

    if (this.ocrEnProceso || state.cargando) {
      this.alert.info('Ya hay un proceso de extracción en curso.');
      return;
    }
    if (!state.pasteImageFile && !state.imageChangedEvent) {
      this.alert.warning('Por favor selecciona o pega una imagen primero.');
      return;
    }
    if (!state.croppedImageBase64) {
      this.alert.warning('Ajusta el área de selección sobre la tabla antes de extraer.');
      return;
    }

    this.ocrEnProceso = true;
    state.cargando = true;
    this.cdr.detectChanges();

    const terminar = () => {
      this.ocrEnProceso = false;
      state.cargando = false;
      try { this.cdr.detectChanges(); } catch { /* noop */ }
    };

    this.imageService.procesarTabla(state.croppedImageBase64).subscribe({
      next: (res: any) => {
        try {
          if (res?.success && res?.table) {
            const tableText = String(res.table).trim();
            let headers: string[] = [];
            let rows: string[][] = [];

            if (tableText.startsWith('<table')) {
              const parsed = this.parseTableHtml(tableText);
              headers = parsed.headers;
              rows = parsed.rows;
            } else {
              const parsed = this.parseTableText(tableText);
              headers = parsed.headers;
              rows = parsed.rows;
            }

            if (headers.length > 0 && rows.length > 0) {
              this.aplicarDatosExtraidos(tableIndex, headers, rows, state.tieneEncabezado);
              this.alert.confirm(
                'La AI puede cometer errores. Verifica los valores extraídos antes de continuar.',
                '⚠ Revisa los datos',
                { type: 'warning', confirmText: 'Entendido, los reviso', cancelText: 'Cerrar', dismissible: false }
              ).then(revisar => {
                if (revisar) this.alert.success('Los datos se vaciaron correctamente.', 'OCR completado');
                else this.alert.info('Puedes revisar los datos antes de guardar.');
              });
            } else {
              this.alert.error('No se pudo extraer una tabla válida de la imagen.', 'OCR');
            }
          } else {
            this.alert.error('No se pudo extraer la tabla.', 'OCR');
          }
        } catch (e) {
          console.error('Error procesando la respuesta:', e);
          this.alert.error('Error al procesar la respuesta del servidor.', 'Error OCR');
        } finally {
          terminar();
        }
      },
      error: (err: any) => {
        console.error('Error en servidor:', err);
        this.alert.error('Ocurrió un error al procesar la tabla en el servidor.', 'Error OCR');
        terminar();
      },
      complete: () => terminar()
    });
  }

  // ========== HELPERS DE NOTACIÓN CIENTÍFICA ==========
  private expandirNotacionCientifica(raw: string): string {
    let s = String(raw ?? '').trim();
    if (!s) return '';

    if (/^-?\d+,\d+(?:[eE][+-]?\d+)?$/.test(s)) s = s.replace(',', '.');
    if (!/[eE]/.test(s)) return s;

    const num = Number(s);
    if (isNaN(num) || !isFinite(num)) return s;

    let resultado = num.toLocaleString('en-US', {
      useGrouping: false,
      maximumSignificantDigits: 21
    });

    if (/[eE]/.test(resultado)) {
      const str = num.toString();
      const m = str.match(/^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
      if (m) {
        const signo = m[1];
        const entero = m[2];
        const decimales = m[3] || '';
        const exp = parseInt(m[4], 10);
        const digitos = entero + decimales;
        const puntoPos = entero.length + exp;
        if (puntoPos <= 0) resultado = signo + '0.' + '0'.repeat(-puntoPos) + digitos;
        else if (puntoPos >= digitos.length) resultado = signo + digitos + '0'.repeat(puntoPos - digitos.length);
        else resultado = signo + digitos.slice(0, puntoPos) + '.' + digitos.slice(puntoPos);
      }
    }
    return resultado;
  }

  // ========== PARSEADOR DE TEXTO ==========
  private parseTableText(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 1) return { headers: [], rows: [] };

    const normalizedLines = lines.map(line => {
      if (line.includes('\t')) return line.replace(/\t/g, ' | ');
      if (line.includes(';')) return line.replace(/;/g, ' | ');
      if (line.includes('|') && !line.includes(' | ')) return line.replace(/\|/g, ' | ');
      if (line.match(/\s{2,}/)) return line.replace(/\s{2,}/g, ' | ');
      return line;
    });

    const separator = ' | ';
    const headers = normalizedLines[0].split(separator).map(h => h.trim()).filter(h => h.length > 0);
    if (headers.length === 0) return { headers: [], rows: [] };

    const rows: string[][] = [];
    for (let i = 1; i < normalizedLines.length; i++) {
      let cells = normalizedLines[i].split(separator).map(c => c.trim());
      while (cells.length < headers.length) cells.push('');
      if (cells.length > headers.length) cells = cells.slice(0, headers.length);
      rows.push(cells);
    }
    return { headers, rows };
  }

  // ========== PARSEADOR DE HTML ==========
  private parseTableHtml(html: string): { headers: string[]; rows: string[][] } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tables = doc.querySelectorAll('table');
    if (tables.length === 0) return { headers: [], rows: [] };

    const table = tables[0];
    const allRows = table.querySelectorAll('tr');
    if (allRows.length === 0) return { headers: [], rows: [] };

    const isHeaderRow = (row: Element): boolean => {
      const cells = row.querySelectorAll('th, td');
      let textCells = 0;
      cells.forEach(cell => {
        const text = cell.textContent?.trim() || '';
        if (text === '') return;
        if (/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(text)) textCells++;
      });
      return cells.length > 0 && (textCells / cells.length) > 0.5;
    };

    let headerRowIndex = 0;
    let dataStartIndex = 1;
    let foundHeader = false;

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      if (row.querySelector('th') !== null) { headerRowIndex = i; dataStartIndex = i + 1; foundHeader = true; break; }
      if (isHeaderRow(row)) { headerRowIndex = i; dataStartIndex = i + 1; foundHeader = true; break; }
    }

    if (!foundHeader) { headerRowIndex = 0; dataStartIndex = 1; }

    const headerRow = allRows[headerRowIndex];
    const headerCells = headerRow.querySelectorAll('th, td');

    const headers: string[] = [];
    headerCells.forEach(cell => {
      const text = cell.textContent?.trim() || '';
      const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
      if (text === '') { for (let c = 1; c < colspan; c++) headers.push(''); return; }
      headers.push(text);
      for (let c = 1; c < colspan; c++) headers.push(text);
    });

    if (headers.length === 0) return { headers: [], rows: [] };

    const dataRows = Array.from(allRows).slice(dataStartIndex);
    const rows: string[][] = [];
    const activeRowspan: { [col: number]: { value: string; remaining: number } } = {};

    dataRows.forEach(row => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      const rowData: string[] = new Array(headers.length).fill('');

      for (let col = 0; col < headers.length; col++) {
        if (activeRowspan[col] && activeRowspan[col].remaining > 0) {
          rowData[col] = activeRowspan[col].value;
          activeRowspan[col].remaining--;
          if (activeRowspan[col].remaining === 0) delete activeRowspan[col];
        }
      }

      let cellIndex = 0;
      for (let col = 0; col < headers.length; col++) {
        if (rowData[col] !== '') continue;
        while (cellIndex < cells.length) {
          const cell = cells[cellIndex];
          const value = cell.textContent?.trim() || '';
          const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10);
          const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
          if (value === '' && rowspan <= 1 && colspan <= 1) { cellIndex++; continue; }
          rowData[col] = value;
          if (rowspan > 1) activeRowspan[col] = { value, remaining: rowspan - 1 };
          for (let c = 1; c < colspan; c++) { if (col + c < headers.length) rowData[col + c] = value; }
          cellIndex++;
          break;
        }
      }

      const tieneAlgunValor = rowData.some(v => v !== '');
      if (!tieneAlgunValor) return;
      rows.push(rowData);
    });

    const lastValues: string[] = new Array(headers.length).fill('');
    const finalRows: string[][] = rows.map(row => {
      const newRow: string[] = [];
      for (let col = 0; col < headers.length; col++) {
        let val = row[col];
        if (val === '' && lastValues[col] !== '') val = lastValues[col];
        newRow.push(val);
        if (val !== '') lastValues[col] = val;
      }
      return newRow;
    });

    return { headers, rows: finalRows };
  }

  private aplicarDatosExtraidos(indexTable: number, headers: string[], rows: string[][], tieneEncabezado: boolean): void {
    const table = this.resultTables[indexTable];
    if (!table) return;

    let headersEfectivos: string[];
    let filasEfectivas: string[][];

    if (tieneEncabezado) {
      headersEfectivos = headers;
      filasEfectivas = rows;
    } else {
      headersEfectivos = headers.map((_, idx) => `col_${idx + 1}`);
      filasEfectivas = [headers.slice(), ...rows];
    }

    const rowsProcesadas: string[][] = filasEfectivas.map(row =>
      row.map(celda => this.expandirNotacionCientifica(celda))
    );

    const usedKeys = new Set<string>();
    const newColumns: Column[] = headersEfectivos.map((header, idx) => {
      const baseKey = (header || '').trim().toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `column_${idx + 1}`;

      let key = baseKey;
      let counter = 1;
      while (usedKeys.has(key)) key = `${baseKey}_${counter++}`;
      usedKeys.add(key);

      let type: TipoDato = 'string';
      for (const row of rowsProcesadas) {
        const raw = row[idx];
        if (raw === undefined || raw === null || String(raw).trim() === '') continue;
        if (this.esNumeroValido(String(raw))) type = 'number';
        break;
      }
      return { key, label: header || `Col ${idx + 1}`, unit: '', type };
    });

    const newRows = rowsProcesadas.map(row => {
      const obj: Record<string, any> = {};
      newColumns.forEach((col, idx) => {
        const raw = row[idx];
        if (col.type === 'number') {
          if (raw === undefined || raw === null || String(raw).trim() === '') obj[col.key] = null;
          else {
            const s = String(raw).trim().replace(',', '.');
            const num = Number(s);
            obj[col.key] = isNaN(num) || !isFinite(num) ? null : num;
          }
        } else {
          obj[col.key] = raw !== undefined && raw !== null && String(raw) !== '' ? String(raw) : null;
        }
      });
      return obj;
    });

    table.columns = newColumns;
    table.rows = newRows.length > 0 ? newRows : [{}];
    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
  }

  // ========== CONSTRUCCIÓN DEL JSON ==========
  obtenerJsonEstructurado(): object {
    this.regenerarTableIds();

    const tablasProcesadas = this.resultTables.map(table => {
      const tiposPorKey: Record<string, TipoDato> = {};
      table.columns.forEach(col => { tiposPorKey[col.key] = col.type; });

      const filasProcesadas = table.rows.map(row => {
        const nuevaFila: Record<string, any> = {};
        Object.keys(row).forEach(key => {
          const valorRaw = row[key];
          const esNumero = tiposPorKey[key] === 'number';
          if (esNumero) {
            if (valorRaw === null || valorRaw === undefined || valorRaw === '') nuevaFila[key] = null;
            else {
              const numVal = Number(valorRaw);
              nuevaFila[key] = isNaN(numVal) ? null : numVal;
            }
          } else {
            nuevaFila[key] = valorRaw !== null && valorRaw !== undefined ? String(valorRaw) : null;
          }
        });
        return nuevaFila;
      });

      return {
        table_id: table.table_id,
        cc_id: this.certificado.cc || '',
        pt: (table.pt || '').trim(),
        title: table.title || '',
        equipment_id: this.certificado.equipment_id,
        parameter: table.parameter || '',
        unit: table.unit || '',
        calibration_equation: table.calibration_equation || '',
        range: table.range || '',
        comments: table.comments || '',
        columns: table.columns,
        rows: filasProcesadas
      };
    });

    return { 'Result Tables': tablasProcesadas };
  }

  obtenerJsonString(): string {
    return JSON.stringify(this.obtenerJsonEstructurado(), null, 2);
  }

  copiarJson(): void {
    navigator.clipboard.writeText(this.jsonInputText).then(() => {
      this.copiadoExitoso = true;
      this.alert.success('JSON copiado al portapapeles');
      setTimeout(() => {
        this.copiadoExitoso = false;
        this.cdr.detectChanges();
      }, 2500);
    });
  }

  validarFormulario(): boolean {
    const errores: string[] = [];
    const c = this.certificado;

    if (!c.equipment_id?.trim()) errores.push('• Debes seleccionar un equipo patrón.');
    else if (!this.patronSeleccionado) errores.push('• El patrón seleccionado no es válido. Vuelve a elegirlo.');

    if (!c.name_equipment?.trim()) errores.push('• El "Nombre del Equipo" está vacío.');
    else if (c.name_equipment.trim().length < 3) errores.push('• El "Nombre del Equipo" debe tener al menos 3 caracteres.');

    if (!c.cc?.trim()) errores.push('• El "Folio del Certificado (cc)" es obligatorio.');
    else if (!/^[A-Za-z0-9\-_/ ]+$/.test(c.cc.trim())) errores.push('• El "Folio (cc)" contiene caracteres no permitidos.');

    if (!c.entity?.trim()) errores.push('• La "Entidad" es obligatoria.');
    if (!c.cert_type?.trim()) errores.push('• El "Tipo de Certificado" es obligatorio.');

    const hoy = this.hoyLocal();
    const fechaCal = this.parseFechaLocal(c.date_cal);
    const fechaCc = this.parseFechaLocal(c.date_cc);

    if (!c.date_cal) errores.push('• La "Fecha de Calibración" es obligatoria.');
    else if (!fechaCal) errores.push('• La "Fecha de Calibración" no tiene un formato válido.');
    else if (fechaCal > hoy) errores.push('• La "Fecha de Calibración" no puede ser una fecha futura.');
    else if (fechaCal.getFullYear() < 1950) errores.push('• La "Fecha de Calibración" parece demasiado antigua (anterior a 1950).');

    if (!c.date_cc) errores.push('• La "Fecha del Certificado" es obligatoria.');
    else if (!fechaCc) errores.push('• La "Fecha del Certificado" no tiene un formato válido.');
    else if (fechaCc > hoy) errores.push('• La "Fecha del Certificado" no puede ser una fecha futura.');

    if (fechaCal && fechaCc) {
      if (fechaCc < fechaCal) errores.push('• La "Fecha del Certificado" no puede ser anterior a la "Fecha de Calibración".');
      if (this.diasEntre(fechaCal, fechaCc) > 365 * 2) errores.push('• Hay más de 2 años entre la "Fecha de Calibración" y la "Fecha del Certificado". Verifica.');
    }

    const intervalo = Number(c.calibration_interval);
    if (!Number.isFinite(intervalo) || intervalo <= 0) errores.push('• El "Intervalo de Calibración" debe ser un número mayor que 0.');
    else if (intervalo > 120) errores.push('• El "Intervalo de Calibración" parece inusualmente alto (> 120 meses).');

    const resolucion = Number(c.resolution);
    if (!Number.isFinite(resolucion) || resolucion < 0) errores.push('• La "Resolución" debe ser un número mayor o igual a 0.');

    for (let i = 0; i < this.resultTables.length; i++) {
      const table = this.resultTables[i];
      const n = i + 1;

      if (!table.title?.trim()) errores.push(`• Tabla #${n}: el título es obligatorio.`);
      if (!table.parameter?.trim()) errores.push(`• Tabla #${n}: el parámetro es obligatorio.`);

      if (this.patronSeleccionado && this.patronSeleccionado.pts.length > 0) {
        if (!table.pt?.trim()) errores.push(`• Tabla #${n}: debes seleccionar un PT para esta tabla.`);
        else if (!this.patronSeleccionado.pts.includes(table.pt)) errores.push(`• Tabla #${n}: el PT "${table.pt}" no pertenece al patrón seleccionado.`);
      }

      if (!table.columns || table.columns.length === 0) {
        errores.push(`• Tabla #${n}: debe tener al menos una columna.`);
        continue;
      }

      const keys = table.columns.map(k => k.key.trim().toLowerCase().replace(/\s+/g, '_'));
      const uniqueKeys = new Set(keys);
      if (keys.length !== uniqueKeys.size) errores.push(`• Tabla #${n}: hay columnas con "key" duplicado.`);

      for (const col of table.columns) {
        const keyLimpio = col.key?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
        if (!keyLimpio) errores.push(`• Tabla #${n}: hay una columna sin "key".`);
        else if (!/^[a-z0-9_]+$/.test(keyLimpio)) errores.push(`• Tabla #${n}: el key "${col.key}" contiene caracteres no permitidos.`);
      }

      const colsNumericas = table.columns.filter(col => col.type === 'number');
      if (colsNumericas.length > 0) {
        for (let r = 0; r < table.rows.length; r++) {
          for (const col of colsNumericas) {
            const val = table.rows[r][col.key];
            if (this.esValorInvalido(val, col)) errores.push(`• Tabla #${n}, fila ${r + 1}, columna "${col.label || col.key}": valor no numérico ("${val}").`);
          }
        }
      }
    }

    if (errores.length > 0) {
      const visibles = errores.slice(0, 8);
      const restantes = errores.length - visibles.length;
      const detalle = visibles.join('\n') + (restantes > 0 ? `\n… y ${restantes} error(es) más.` : '');
      this.alert.error(detalle, `Errores de validación (${errores.length})`);
      return false;
    }
    return true;
  }

  private traducirErrorBackend(err: any): { titulo: string; mensaje: string } {
    if (err?.name === 'TimeoutError') return { titulo: 'Tiempo de espera agotado', mensaje: 'El servidor tardó más de 30 s en responder. Verifica tu conexión e inténtalo de nuevo.' };
    if (err?.status === 0 || (err?.name === 'HttpErrorResponse' && !err?.status)) return { titulo: 'Sin conexión', mensaje: 'No se pudo contactar con el servidor. Revisa tu red o inténtalo más tarde.' };

    const status = err?.status ?? err?.error?.status ?? null;
    const body = err?.error ?? {};
    const code = body.code ?? err?.code ?? null;
    const message = body.message ?? err?.message ?? '';
    const detail = body.detail ?? err?.detail ?? '';
    const constraint = body.constraint ?? err?.constraint ?? '';
    const column = body.column ?? err?.column ?? '';

    if (code === '23505' || status === 409) {
      const texto = `${message} ${detail} ${constraint}`.toLowerCase();
      const folio = (this.certificado.cc || '').trim();
      if (texto.includes('cc') || texto.includes('folio')) return { titulo: 'Folio duplicado', mensaje: `Ya existe un certificado registrado con el folio "${folio}".` };
      if (texto.includes('equipment_id')) return { titulo: 'Equipo duplicado', mensaje: `Ya existe un certificado para el equipo "${this.certificado.equipment_id}".` };
      return { titulo: 'Registro duplicado', mensaje: detail || message || 'El registro ya existe en la base de datos.' };
    }

    if (code === '23503') return { titulo: 'Referencia inválida', mensaje: detail || 'La entidad o equipo referenciado no existe en el sistema.' };
    if (code === '23502') return { titulo: 'Campo obligatorio faltante', mensaje: `El campo "${column || detail || 'desconocido'}" es obligatorio en la base de datos.` };
    if (code === '23514') return { titulo: 'Valor fuera de rango', mensaje: detail || `Un valor no cumple con las restricciones (${constraint}).` };
    if (code === '22P02' || code === '22007' || code === '22008' || code === '22003') return { titulo: 'Formato de dato inválido', mensaje: detail || 'Revisa el formato de fechas y valores numéricos antes de guardar.' };

    if (status === 400) return { titulo: 'Solicitud inválida', mensaje: message || detail || 'Revisa los datos enviados.' };
    if (status === 401 || status === 403) return { titulo: 'Acceso denegado', mensaje: 'No tienes permisos para realizar esta acción.' };
    if (status === 404) return { titulo: 'No encontrado', mensaje: message || 'El recurso solicitado no existe.' };
    if (status === 413) return { titulo: 'Datos demasiado grandes', mensaje: 'El payload excede el tamaño permitido.' };
    if (status >= 500) return { titulo: `Error del servidor (${status})`, mensaje: message || 'Ocurrió un error interno. Intenta más tarde o contacta al administrador.' };

    return { titulo: 'Error al guardar', mensaje: message || detail || 'Error desconocido al conectar con la API de PostgreSQL.' };
  }

  // ========== GUARDAR ==========
  guardarCertificado(): void {
    if (this.guardando) return;
    if (!this.validarFormulario()) return;
    const user = this.auth.getUser();
    if (!user) {
      this.alert.error('Debes iniciar sesión para guardar un certificado.', 'Sesión requerida');
      return;
    }

    this.guardando = true;
    this.cdr.detectChanges();

    this.regenerarTableIds();
    this.sincronizarJsonTexto();

    const payload: Certificado = {
      ...this.certificado,
      equipment_id: (this.certificado.equipment_id ?? '').trim(),
      name_equipment: (this.certificado.name_equipment ?? '').trim(),
      cc: (this.certificado.cc ?? '').trim(),
      id_user: String(user.id_user),
      entity: (this.certificado.entity ?? '').trim(),
      cert_type: (this.certificado.cert_type ?? '').trim(),
      data: this.obtenerJsonEstructurado()
    };

    this.certificadoService.crearCertificado(payload).pipe(
      timeout(30000),
      finalize(() => {
        this.guardando = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        this.alert.success('¡Certificado guardado correctamente!', 'Guardado');
        this.limpiarFormulario();
      },
      error: (err: any) => {
        console.error('Error al guardar:', err);
        const { titulo, mensaje } = this.traducirErrorBackend(err);
        this.alert.error(mensaje, titulo);
        if (titulo === 'Folio duplicado') {
          setTimeout(() => {
            const el = document.getElementById('cc') as HTMLInputElement | null;
            el?.focus();
            el?.select();
          }, 0);
        }
      }
    });
  }

  // ========== LIMPIAR ==========
  limpiarFormulario(): void {
    this.certificado = {
      equipment_id: '', name_equipment: '', cc: '', id_user: '',
      date_cal: '', date_cc: '', calibration_interval: 0, resolution: 0,
      entity: '', cert_type: '', comments: '', active: true, data: {}
    };
    this.patronSeleccionado = null;
    this.resultTables = [this.crearEstructuraTablaInicial()];
    this.imageStates = [this.crearEstadoImagenVacio()];
    this.ocrEnProceso = false;
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
  }

  ayuda(modal: string): void {
    // ... (Mismo bloque de ayuda sin cambios)
    const clave = String(modal ?? '').trim().toLowerCase();
    let detalle = '';

    if (clave === 'general') {
      detalle = `
        <h3 style="margin-top:0; color:#0d6efd;">1. Datos generales del certificado</h3>
        <p>Esta sección registra la identificación del certificado y del instrumento calibrado. Los campos marcados con <span style="color:#dc3545;">*</span> son obligatorios.</p>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Folio / CC</h4>
        <ul>
          <li>Número único del certificado. No puede repetirse en el sistema.</li>
          <li>Al cambiarlo se <b>regeneran automáticamente</b> los <code>table_id</code> de todas las tablas (<code>CC-XXXX-T1</code>, <code>CC-XXXX-T2</code>, …).</li>
          <li>Caracteres permitidos: letras, números, guiones, guiones bajos y <code>/</code>.</li>
        </ul>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Fechas</h4>
        <ul>
          <li><b>Fecha de calibración:</b> se autollena al elegir el patrón, pero sigue siendo editable si la del certificado difiere.</li>
          <li><b>Fecha del certificado:</b> la ingresas manualmente. Debe ser <b>igual o posterior</b> a la de calibración y <b>no puede ser futura</b>.</li>
          <li>Si hay más de 2 años de diferencia entre ambas fechas, el sistema te lo advertirá antes de guardar.</li>
        </ul>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Entidad emisora y tipo</h4>
        <ul>
          <li><b>Entidad emisora:</b> organismo que emite el certificado (p. ej. <code>LECOE</code>).</li>
          <li><b>Tipo:</b> <code>Certificado</code> (calibración formal) o <code>Especificaciones del fabricante</code> (hoja de datos).</li>
        </ul>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Intervalo y resolución</h4>
        <ul>
          <li><b>Intervalo de calibración:</b> se autollena desde el patrón y queda bloqueado. Se reporta en <b>meses</b>.</li>
          <li><b>Resolución:</b> resolución del instrumento calibrado (la del certificado, no la del patrón).</li>
        </ul>
        <p style="color:#6c757d; font-size:0.9em;"><i>Al guardar se validan automáticamente fechas, folio único, entidad, tipo y coherencia de cada tabla.</i></p>
      `;
    } else if (clave === 'patron') {
      detalle = `
        <h3 style="margin-top:0; color:#198754;">2. Selección del patrón y del PT por tabla</h3>
        <p>El componente usa una jerarquía <b>Patrón → PT por tabla</b>. El PT ya no se almacena en la tabla de certificados: vive dentro del JSON de cada tabla de resultados.</p>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Paso 1 — Elegir el patrón (global)</h4>
        <ul>
          <li>Cada patrón puede aparecer varias veces en el catálogo, una por cada PT con el que es compatible.</li>
          <li>El sistema agrupa esas repeticiones en una sola entrada y acumula la lista de PTs aplicables.</li>
          <li>Al seleccionar el patrón se autocompletan <b>nombre</b>, <b>fecha de calibración</b> e <b>intervalo</b>.</li>
        </ul>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Paso 2 — Elegir el PT de cada tabla</h4>
        <ul>
          <li>Cada tabla tiene su propio selector de PT, con las opciones que ofrece el patrón seleccionado.</li>
          <li>Puedes tener varias tablas con PTs distintos (por ejemplo, una tabla en <code>DC Voltage</code> y otra en <code>AC Voltage</code>).</li>
          <li>Si el patrón no tiene PTs asociados, las tablas se guardan sin PT (cadena vacía).</li>
        </ul>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Dónde se guarda el PT</h4>
        <ul>
          <li>El PT de cada tabla se guarda en <code>Result Tables[i].pt</code>.</li>
          <li>Ya <b>no</b> existe la columna <code>pt</code> en la tabla de certificados.</li>
          <li>Al cambiar el patrón global, se limpian los PTs de las tablas que ya no sean válidos para el nuevo patrón.</li>
        </ul>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Errores comunes</h4>
        <ul>
          <li><b>"Debes seleccionar un PT para esta tabla":</b> el patrón tiene PTs y esa tabla no tiene uno asignado.</li>
          <li><b>"No ves tu patrón":</b> verifica que exista en el catálogo de <code>calibraciones.patron</code>.</li>
        </ul>
      `;
    } else if (clave === 'tablas') {
      detalle = `
        <h3 style="margin-top:0; color:#fd7e14;">3. Estructura de las tablas de resultados</h3>
        <p>Cada certificado contiene <b>una o más tablas</b>. Cada tabla representa un conjunto de mediciones del mismo mensurando.</p>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Encabezado de la tabla</h4>
        <ul>
          <li><b>Título:</b> magnitud general. Al cambiarlo, los parámetros disponibles se actualizan.</li>
          <li><b>Mesurando (Parameter):</b> variante específica dentro del título.</li>
          <li><b>PT:</b> procedimiento técnico asociado a esta tabla. Se elige en el selector de PT de la tabla.</li>
          <li><b>Unidad / Rango / Ecuación / Comentarios:</b> metadatos propios de la tabla.</li>
          <li><b>CC ID / Table ID:</b> se generan automáticamente. <code>Table ID</code> añade <code>-T1</code>, <code>-T2</code>, …</li>
        </ul>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Columnas</h4>
        <ul>
          <li><b>key:</b> identificador técnico único (minúsculas, números y guiones bajos).</li>
          <li><b>label:</b> nombre visible.</li>
          <li><b>unit:</b> unidad específica de la columna.</li>
          <li><b>type:</b> <code>number</code> o <code>string</code>; define validación y guardado.</li>
        </ul>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Filas</h4>
        <ul>
          <li>Cada fila es un punto de medición.</li>
          <li>Los valores no numéricos en columnas <code>number</code> se marcan en rojo y bloquean el guardado.</li>
        </ul>
      `;
    } else if (clave === 'ocr') {
      detalle = `
        <h3 style="margin-top:0; color:#6f42c1;">4. Extracción de tablas desde imagen (OCR)</h3>
        <p>Convierte una captura de la tabla en <b>columnas y filas editables</b>.</p>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Paso 1 — Cargar la imagen</h4>
        <ul>
          <li><b>Pegar:</b> clic en la zona punteada y <kbd>Ctrl</kbd> + <kbd>V</kbd>.</li>
          <li><b>Subir archivo:</b> selector de imágenes JPG, PNG, etc.</li>
        </ul>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Paso 2 — Recortar</h4>
        <p>Recorta solo la tabla, incluyendo encabezados si existen, excluyendo logos y texto externo.</p>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Paso 3 — Encabezado sí / no</h4>
        <ul>
          <li><b>Sí:</b> la primera fila es el encabezado.</li>
          <li><b>No:</b> la imagen solo contiene datos; se generan columnas <code>col_1</code>, <code>col_2</code>, …</li>
        </ul>
        <div style="background:#fff3cd; border-left:4px solid #ffc107; padding:.6rem .8rem; border-radius:.35rem; margin:.9rem 0;">
          <b>⚠ Advertencia</b>
          <ul style="margin:.35rem 0 0; padding-left:1.2rem;">
            <li>La IA puede cometer errores. <b>Verifica siempre</b> los valores contra el certificado original.</li>
            <li>Si el resultado no es bueno, <b>vuelve a tomar la captura</b> con mejor resolución y la tabla recta.</li>
          </ul>
        </div>
      `;
    } else if (clave === 'json') {
      detalle = `
        <h3 style="margin-top:0; color:#212529;">5. JSON del certificado y guardado</h3>
        <p>El JSON es la representación estructurada de todas las tablas y se actualiza automáticamente. El <b>PT</b> vive dentro de cada tabla (<code>Result Tables[i].pt</code>) y ya no en la tabla de certificados.</p>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Acciones</h4>
        <ul>
          <li><b>Copiar JSON:</b> copia al portapapeles.</li>
          <li><b>Actualizar desde JSON:</b> valida y reemplaza las tablas del formulario.</li>
          <li><b>Guardar Certificado:</b> valida todo y envía el payload al backend.</li>
        </ul>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Validaciones aplicadas al guardar</h4>
        <ul>
          <li>Patrón válido y PT definido en cada tabla si el patrón lo requiere.</li>
          <li>Folio único, entidad y tipo de certificado.</li>
          <li>Fechas coherentes (<code>calibración ≤ certificado ≤ hoy</code>).</li>
          <li>Intervalo y resolución razonables.</li>
          <li>Cada tabla con título, parámetro, PT (si aplica) y columnas válidas.</li>
          <li>Valores numéricos correctos en columnas con <code>type = number</code>.</li>
        </ul>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Errores del servidor</h4>
        <ul>
          <li>Códigos SQL/HTTP traducidos: folio duplicado, campos NOT NULL, formato inválido, timeout, etc.</li>
        </ul>
      `;
    } else {
      detalle = `
        <p>No hay ayuda disponible para <code>${this.escapeHtml(clave)}</code>.</p>
        <p>Bloques disponibles: <code>general</code>, <code>patron</code>, <code>tablas</code>, <code>ocr</code>, <code>json</code>.</p>
      `;
    }

    this.alert.alert(detalle, 'Información', {
      type: 'info', confirmText: 'Sí, entendido', dismissible: true, size: 'xl',
      sizeOptions: { width: '1200px', maxWidth: '95vw', maxHeight: '85vh', scrollable: true, messageMaxHeight: '60vh', fontSize: '15px', lineHeight: 1.6 },
    });
  }

  private escapeHtml(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
}
