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
import { Certificado, ResultTable, Column } from '../../models/certificado.models';
import { CertService } from '../../services/cert.service';
import { ImageService } from '../../services/image.service';
import {
  ImageCropperComponent,
  ImageCroppedEvent,
  LoadedImage
} from 'ngx-image-cropper';

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
  isBrowser: boolean = isPlatformBrowser(this.platformId);

  opcionesTitulo: string[] = [
    'DC Voltage',
    'AC Voltage',
    'DC Current',
    'AC Current',
    'Resistance',
    '4-Wire Resistance',
    'Lightning Impulse Voltage (LI)',
    'Switching Impulse Voltage (SI)',
    'Frequency',
    'Other'
  ];

  private opcionesParametroPorTitulo: Record<string, string[]> = {
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
    'Other': []
  };

  certificado: Certificado = {
    equipment_id: '',
    name_equipment: '',
    cc: '',
    date_cal: '',
    date_cc: '',
    calibration_interval: 0,
    resolution: 0,
    entity: '',
    cert_type: '',
    comments: '',
    active: true,
    data: {}
  };

  resultTables: ResultTable[] = [];
  direccionTab: DireccionTab = 'vertical';
  jsonInputText: string = '';
  mensajeRespuesta: string | null = null;
  mensajeAlerta: string | null = null;
  esError: boolean = false;
  copiadoExitoso: boolean = false;
  guardando: boolean = false;

  imageStates: TableImageState[] = [];

  // 🔑 id de timeout de alertas para poder cancelar el anterior
  private alertTimeoutId: any = null;

  constructor(
    private certificadoService: CertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.resultTables = [this.crearEstructuraTablaInicial()];
    this.imageStates = [this.crearEstadoImagenVacio()];
    this.regenerarTableIds(); // 🔑 asigna {folio}-T1
    this.sincronizarJsonTexto();
  }

  // ========== 🔑 GENERACIÓN DE table_id ==========

  /**
   * Construye el id de una tabla a partir del folio del certificado.
   * Formato: {cc}-T{n}  →  "CERT-2026-00123-T1"
   * Si el cc aún está vacío, devuelve solo "T{n}".
   */
  private construirTableId(indexTable: number): string {
    const folio = (this.certificado.cc || '').trim();
    const sufijo = `T${indexTable + 1}`;
    return folio ? `${folio}-${sufijo}` : sufijo;
  }

  /**
   * Recalcula table_id y cc_id en todas las tablas según su posición actual.
   * Se llama cada vez que cambia el folio del certificado, o cuando se
   * agrega / elimina / reordena una tabla.
   */
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
      imageChangedEvent: null,
      pasteImageFile: undefined,
      croppedImageBase64: '',
      cargando: false,
      tieneEncabezado: true
    };
  }

  // ========== ESTRUCTURA INICIAL ==========
  private crearEstructuraTablaInicial(): ResultTable {
    return {
      title: 'DC Voltage',
      equipment_id: this.certificado.equipment_id || '',
      cc_id: this.certificado.cc || '',
      table_id: '', // 🔑 se asignará con regenerarTableIds()
      parameter: this.obtenerOpcionesParametro('DC Voltage')[0] || 'Voltage',
      unit: '',
      calibration_equation: '',
      range: '',
      comments: '',
      columns: [
        { key: 'key', label: 'Label', unit: 'Units', type: 'number' },
      ],
      rows: [{}]
    };
  }

  // ========== JSON ==========
  sincronizarJsonTexto(): void {
    this.jsonInputText = this.obtenerJsonString();
  }

  onTableChange(): void {
    // 🔑 Al cambiar datos del certificado (cc, equipment_id, etc.)
    // se regeneran los ids de todas las tablas.
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
  }

  esTituloPredefinido(title: string): boolean {
    const predefinidos = this.opcionesTitulo.slice(0, -1);
    return predefinidos.includes(title);
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

  private validarKey(
    key: string,
    table: ResultTable,
    columnaActual?: Column
  ): { valido: boolean; mensaje?: string } {
    const keyLimpio = key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!keyLimpio) return { valido: false, mensaje: 'El key no puede estar vacío.' };
    if (!/^[a-z0-9_]+$/.test(keyLimpio)) {
      return { valido: false, mensaje: 'El key solo puede contener letras, números y guión bajo.' };
    }
    for (const col of table.columns) {
      if (columnaActual && col === columnaActual) continue;
      if (col.key === keyLimpio) {
        return { valido: false, mensaje: `El key "${keyLimpio}" ya existe en esta tabla.` };
      }
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
        const equipmentId = t.equipment_id || this.certificado.equipment_id || '';
        const ccId = t.cc || t.cc_id || this.certificado.cc || '';
        return {
          title: t.title || '',
          equipment_id: equipmentId,
          cc_id: ccId,
          // 🔑 Se preserva el table_id del JSON solo si coincide con el folio actual;
          // si no, se recalcula más abajo con regenerarTableIds().
          table_id: t.table_id || '',
          cmc: t.cmc || '',
          parameter: t.parameter || '',
          unit: t.unit || '',
          calibration_equation: t.calibration_equation || '',
          range: t.range || '',
          comments: t.comments || '',
          columns: t.columns,
          rows: t.rows
        };
      });

      if (tablasNuevas.length === 0) {
        throw new Error('Debe incluir al menos una tabla de resultados en el JSON.');
      }

      this.resultTables = tablasNuevas;
      this.imageStates = tablasNuevas.map(() => this.crearEstadoImagenVacio());

      // 🔑 Normaliza los ids según el folio actual
      this.regenerarTableIds();
      this.sincronizarJsonTexto();
      this.mostrarAlerta('Las tablas han sido actualizadas desde el JSON correctamente.', false);
    } catch (err: any) {
      this.mostrarAlerta(`JSON Inválido: ${err.message}`, true);
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
    if (targetInput) {
      targetInput.focus();
      targetInput.select();
    }
  }

  // ========== GESTIÓN DE TABLAS ==========
  agregarTabla(): void {
    this.resultTables.push(this.crearEstructuraTablaInicial());
    this.imageStates.push(this.crearEstadoImagenVacio());
    this.regenerarTableIds(); // 🔑 asigna {folio}-T{n+1}
    this.sincronizarJsonTexto();
  }

  eliminarTabla(indexTable: number): void {
    if (this.resultTables.length > 1) {
      this.resultTables.splice(indexTable, 1);
      this.imageStates.splice(indexTable, 1);
      // 🔑 Reindexamos T1..Tn para mantener la secuencia "hasta completar"
      this.regenerarTableIds();
      this.sincronizarJsonTexto();
    }
  }

  // ========== GESTIÓN DE COLUMNAS ==========
  agregarColumna(table: ResultTable): void {
    const id = table.columns.length + 1;
    const nuevaKey = `column_${id}`;
    table.columns.push({
      key: nuevaKey,
      label: `New Column ${id}`,
      unit: '',
      type: 'number'
    });
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
      this.mostrarAlerta(`Key inválido: ${resultado.mensaje}`, true);
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

  cambiarTipoDato(col: Column, table: ResultTable): void {
    // No borramos los valores: si el tipo pasa a 'number' y algún
    // valor no es numérico, esValorInvalido() lo marcará en rojo.
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
          state.pasteImageFile = new File(
            [file],
            `pasted_image_${Date.now()}.png`,
            { type: file.type }
          );
          this.cdr.detectChanges();
          imagenEncontrada = true;
        }
        break;
      }
    }

    if (!imagenEncontrada) {
      this.mostrarAlerta('El contenido pegado no es una imagen válida.', true);
    }
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

  imageLoaded(_image?: LoadedImage): void {
    this.cdr.detectChanges();
  }

  cropperReady(): void { /* listo */ }

  loadImageFailed(_tableIndex?: number): void {
    this.mostrarAlerta('Error al cargar la imagen. Intenta con otra captura o archivo.', true);
  }

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
    return fetch(blobUrl)
      .then(r => r.blob())
      .then(
        blob =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          })
      );
  }

  // ========== ENVIAR A BACKEND Y APLICAR DATOS ==========
  enviarANode(tableIndex: number): void {
    const state = this.imageStates[tableIndex];
    const table = this.resultTables[tableIndex];
    if (!state || !table) return;

    if (!state.pasteImageFile && !state.imageChangedEvent) {
      this.mostrarAlerta('Por favor selecciona o pega una imagen primero.', true);
      return;
    }
    if (!state.croppedImageBase64) {
      this.mostrarAlerta('Ajusta el área de selección sobre la tabla antes de extraer.', true);
      return;
    }

    state.cargando = true;
    this.cdr.detectChanges();

    const terminar = () => {
      state.cargando = false;
      try { this.cdr.detectChanges(); } catch { /* noop */ }
    };

    this.imageService
      .procesarTabla(state.croppedImageBase64)
      .subscribe({
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
                this.aplicarDatosExtraidos(
                  tableIndex,
                  headers,
                  rows,
                  state.tieneEncabezado
                );
                this.mostrarAlerta(
                  'Tabla extraída correctamente. Completa título, mesurando, ecuación, rango y unidad.',
                  false
                );
              } else {
                this.mostrarAlerta('No se pudo extraer una tabla válida de la imagen.', true);
              }
            } else {
              this.mostrarAlerta('No se pudo extraer la tabla.', true);
            }
          } catch (e) {
            console.error('Error procesando la respuesta:', e);
            this.mostrarAlerta('Error al procesar la respuesta del servidor.', true);
          } finally {
            terminar();
          }
        },
        error: (err: any) => {
          console.error('Error en servidor:', err);
          this.mostrarAlerta('Ocurrió un error al procesar la tabla en el servidor.', true);
          terminar();
        },
        complete: () => terminar()
      });
  }

  // ========== HELPERS DE NOTACIÓN CIENTÍFICA ==========
  private expandirNotacionCientifica(raw: string): string {
    let s = String(raw ?? '').trim();
    if (!s) return '';

    if (/^-?\d+,\d+(?:[eE][+-]?\d+)?$/.test(s)) {
      s = s.replace(',', '.');
    }

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
        if (puntoPos <= 0) {
          resultado = signo + '0.' + '0'.repeat(-puntoPos) + digitos;
        } else if (puntoPos >= digitos.length) {
          resultado = signo + digitos + '0'.repeat(puntoPos - digitos.length);
        } else {
          resultado = signo + digitos.slice(0, puntoPos) + '.' + digitos.slice(puntoPos);
        }
      }
    }

    return resultado;
  }

  // ========== PARSEADOR DE TEXTO ==========
  private parseTableText(text: string): { headers: string[]; rows: string[][] } {
    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length < 1) return { headers: [], rows: [] };

    const normalizedLines = lines.map(line => {
      if (line.includes('\t')) return line.replace(/\t/g, ' | ');
      if (line.includes(';')) return line.replace(/;/g, ' | ');
      if (line.includes('|') && !line.includes(' | ')) return line.replace(/\|/g, ' | ');
      if (line.match(/\s{2,}/)) return line.replace(/\s{2,}/g, ' | ');
      return line;
    });

    const separator = ' | ';
    const headers = normalizedLines[0]
      .split(separator)
      .map(h => h.trim())
      .filter(h => h.length > 0);

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
      if (row.querySelector('th') !== null) {
        headerRowIndex = i; dataStartIndex = i + 1; foundHeader = true; break;
      }
      if (isHeaderRow(row)) {
        headerRowIndex = i; dataStartIndex = i + 1; foundHeader = true; break;
      }
    }

    if (!foundHeader) { headerRowIndex = 0; dataStartIndex = 1; }

    const headerRow = allRows[headerRowIndex];
    const headerCells = headerRow.querySelectorAll('th, td');
    const headers: string[] = [];
    headerCells.forEach(cell => headers.push(cell.textContent?.trim() || ''));

    const dataRows = Array.from(allRows).slice(dataStartIndex);
    const rows: string[][] = [];
    const activeRowspan: { [col: number]: { value: string; remaining: number } } = {};

    dataRows.forEach(row => {
      const cells = row.querySelectorAll('td');
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
        if (rowData[col] === '' && cellIndex < cells.length) {
          const cell = cells[cellIndex];
          const value = cell.textContent?.trim() || '';
          const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10);
          const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);

          rowData[col] = value;
          if (rowspan > 1) activeRowspan[col] = { value, remaining: rowspan - 1 };
          for (let c = 1; c < colspan; c++) {
            if (col + c < headers.length) rowData[col + c] = value;
          }
          cellIndex++;
        }
      }

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

  // ========== APLICAR DATOS EXTRAÍDOS ==========
  private aplicarDatosExtraidos(
    indexTable: number,
    headers: string[],
    rows: string[][],
    tieneEncabezado: boolean
  ): void {
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
      const baseKey =
        (header || '')
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '') || `column_${idx + 1}`;

      let key = baseKey;
      let counter = 1;
      while (usedKeys.has(key)) key = `${baseKey}_${counter++}`;
      usedKeys.add(key);

      let type: TipoDato = 'string';
      for (const row of rowsProcesadas) {
        const raw = row[idx];
        if (raw === undefined || raw === null || String(raw).trim() === '') continue;
        if (this.esNumeroValido(String(raw))) {
          type = 'number';
        }
        break;
      }

      return { key, label: header || `Col ${idx + 1}`, unit: '', type };
    });

    const newRows = rowsProcesadas.map(row => {
      const obj: Record<string, any> = {};
      newColumns.forEach((col, idx) => {
        const raw = row[idx];
        if (col.type === 'number') {
          if (raw === undefined || raw === null || String(raw).trim() === '') {
            obj[col.key] = null;
          } else {
            const s = String(raw).trim().replace(',', '.');
            const num = Number(s);
            obj[col.key] = isNaN(num) || !isFinite(num) ? null : num;
          }
        } else {
          obj[col.key] =
            raw !== undefined && raw !== null && String(raw) !== ''
              ? String(raw)
              : null;
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
    // 🔑 Nos aseguramos de que los ids estén al día antes de serializar
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
            if (valorRaw === null || valorRaw === undefined || valorRaw === '') {
              nuevaFila[key] = null;
            } else {
              const numVal = Number(valorRaw);
              nuevaFila[key] = isNaN(numVal) ? null : numVal;
            }
          } else {
            nuevaFila[key] =
              valorRaw !== null && valorRaw !== undefined ? String(valorRaw) : null;
          }
        });
        return nuevaFila;
      });

      return {
        // 🔑 Identificadores compuestos
        table_id: table.table_id,
        cc_id: this.certificado.cc || '',
        // Datos descriptivos
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
      setTimeout(() => {
        this.copiadoExitoso = false;
        this.cdr.detectChanges();
      }, 2500);
    });
  }

  // ========== VALIDACIONES ==========
  validarFormulario(): boolean {
    if (!this.certificado.equipment_id || !this.certificado.equipment_id.trim()) {
      this.mostrarAlerta('El "ID del Equipo" es un campo obligatorio.', true);
      return false;
    }
    if (!this.certificado.name_equipment || !this.certificado.name_equipment.trim()) {
      this.mostrarAlerta('El "Nombre del Equipo" es un campo obligatorio.', true);
      return false;
    }
    // 🔑 El folio es necesario para construir table_id de forma trazable
    if (!this.certificado.cc || !this.certificado.cc.trim()) {
      this.mostrarAlerta('El "Folio del Certificado (cc)" es un campo obligatorio.', true);
      return false;
    }
    if (this.certificado.date_cal && this.certificado.date_cc) {
      const fechaCal = new Date(this.certificado.date_cal);
      const fechaCc = new Date(this.certificado.date_cc);
      if (fechaCc < fechaCal) {
        this.mostrarAlerta(
          'La "Fecha del Certificado" no puede ser anterior a la "Fecha de Calibración".',
          true
        );
        return false;
      }
    }

    for (let i = 0; i < this.resultTables.length; i++) {
      const table = this.resultTables[i];
      const numTable = i + 1;

      if (!table.title || !table.title.trim()) {
        this.mostrarAlerta(`El título de la Tabla #${numTable} es obligatorio.`, true);
        return false;
      }
      if (!table.parameter || !table.parameter.trim()) {
        this.mostrarAlerta(`El parámetro de la Tabla #${numTable} es obligatorio.`, true);
        return false;
      }
      // 🔑 table_id debe existir (se regenera antes de validar)
      if (!table.table_id) {
        this.regenerarTableIds();
        if (!table.table_id) {
          this.mostrarAlerta(`No se pudo generar el ID de la Tabla #${numTable}.`, true);
          return false;
        }
      }

      const keys = table.columns.map(c => c.key.trim().toLowerCase().replace(/\s+/g, '_'));
      const uniqueKeys = new Set(keys);
      if (keys.length !== uniqueKeys.size) {
        this.mostrarAlerta(`La Tabla #${numTable} tiene columnas con keys duplicados.`, true);
        return false;
      }
      for (const col of table.columns) {
        const keyLimpio = col.key.trim().toLowerCase().replace(/\s+/g, '_');
        if (!keyLimpio) {
          this.mostrarAlerta(`La Tabla #${numTable} tiene una columna con key vacío.`, true);
          return false;
        }
        if (!/^[a-z0-9_]+$/.test(keyLimpio)) {
          this.mostrarAlerta(
            `La Tabla #${numTable} tiene un key con caracteres no permitidos: "${col.key}".`,
            true
          );
          return false;
        }

        if (col.type === 'number') {
          for (let r = 0; r < table.rows.length; r++) {
            const val = table.rows[r][col.key];
            if (this.esValorInvalido(val, col)) {
              this.mostrarAlerta(
                `La Tabla #${numTable}, columna "${col.label}" contiene un valor no numérico ("${val}"). Corrígelo para continuar.`,
                true
              );
              return false;
            }
          }
        }
      }
    }
    return true;
  }

  // ========== ALERTAS ==========
  mostrarAlerta(mensaje: string, esError: boolean): void {
    if (this.alertTimeoutId) {
      clearTimeout(this.alertTimeoutId);
      this.alertTimeoutId = null;
    }

    this.mensajeRespuesta = mensaje;
    this.esError = esError;

    this.mensajeAlerta = esError
      ? 'Verifica los datos extraídos, la AI puede cometer errores.'
      : null;

    this.cdr.detectChanges();

    this.alertTimeoutId = setTimeout(() => {
      this.mensajeRespuesta = null;
      this.mensajeAlerta = null;
      this.alertTimeoutId = null;
      this.cdr.detectChanges();
    }, 8000);
  }

  // ========== GUARDAR ==========
  guardarCertificado(): void {
    if (this.guardando) return;
    if (!this.validarFormulario()) return;

    this.guardando = true;
    this.mensajeRespuesta = null;
    this.cdr.detectChanges();

    // 🔑 Antes de serializar, aseguramos que los ids estén al día
    this.regenerarTableIds();
    this.sincronizarJsonTexto();

    const payload: Certificado = {
      ...this.certificado,
      equipment_id: this.certificado.equipment_id.trim(),
      name_equipment: this.certificado.name_equipment.trim(),
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
        this.mostrarAlerta('¡Certificado guardado correctamente!', false);
        this.limpiarFormulario();
      },
      error: (err: any) => {
        console.error('Error al guardar:', err);
        const msg =
          err?.name === 'TimeoutError'
            ? 'El servidor tardó demasiado en responder. Intenta de nuevo.'
            : (err?.error?.message || 'Error al conectar con la API de PostgreSQL.');
        this.mostrarAlerta(msg, true);
      }
    });
  }

  // ========== LIMPIAR ==========
  limpiarFormulario(): void {
    this.certificado = {
      equipment_id: '',
      name_equipment: '',
      cc: '',
      date_cal: '',
      date_cc: '',
      calibration_interval: 0,
      resolution: 0,
      entity: '',
      cert_type: '',
      comments: '',
      active: true,
      data: {}
    };
    this.resultTables = [this.crearEstructuraTablaInicial()];
    this.imageStates = [this.crearEstadoImagenVacio()];
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
  }
}
