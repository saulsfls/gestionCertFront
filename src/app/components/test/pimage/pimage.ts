import {
  Component,
  ChangeDetectorRef,
  inject,
  PLATFORM_ID,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ImageCropperComponent,
  ImageCroppedEvent,
  LoadedImage,
} from 'ngx-image-cropper';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';

import { ImageService } from '../../../services/database/external/image.service';
import { EquipmentService } from '../../../services/database/external/equipment.service';
import { AlertService } from '../../../services/core/alert.service';

// ========== TIPOS MULTI-IMAGEN ==========
interface MultiImageItem {
  id: string;
  file: File;
  base64: string;
  nombre: string;
}

interface MultiImageState {
  items: MultiImageItem[];
  abierto: boolean;
  procesando: boolean;
  error: string | null;
  cargandoArchivos: boolean;
}

@Component({
  selector: 'app-pimage',
  standalone: true,
  imports: [CommonModule, ImageCropperComponent],
  templateUrl: './pimage.html',
  styleUrl: './pimage.css',
})
export class Pimage implements OnInit, OnDestroy {
  private platformId = inject(PLATFORM_ID);
  isBrowser: boolean = isPlatformBrowser(this.platformId);
  private equipment = inject(EquipmentService);
  private alertService = inject(AlertService);

  // ========== TABLA CRUZADA PATRÓN / EQUIPO ==========
  cargandoCruzada: boolean = false;
  private subCruzada?: Subscription;

  // ========== CROPPER / IMAGEN ==========
  imageChangedEvent: Event | null = null;
  pasteImageFile: File | undefined = undefined;
  croppedImageBase64: string = '';
  cargando: boolean = false;

  // Propiedades para la tabla extraída por OCR
  tablaHeaders: string[] = [];
  tablaRows: string[][] = [];
  mostrarTabla: boolean = false;
  tablaTexto: string = '';

  patrones: any;
  equipos: any;

  // ========== MULTI-IMAGEN (unión vertical) ==========
  modoExtraccion: 'single' | 'multi' = 'single';
  multiState: MultiImageState = this.crearMultiStateVacio();

  /** Evita lanzar 2 OCR a la vez (single + multi). */
  ocrEnProceso: boolean = false;

  constructor(
    private imageService: ImageService,
    private cdr: ChangeDetectorRef
  ) {}

  // ============================================================
  //  CICLO DE VIDA
  // ============================================================
  ngOnInit(): void {
    this.cargaPatronesCruzados();
  }

  ngOnDestroy(): void {
    this.subCruzada?.unsubscribe();
  }

  cargaPatronesCruzados(): void {
    this.subCruzada = this.equipment.getPatronesCruzados().subscribe({
      next: (res) => console.log(res),
    });
  }

  cargarPatrones(): void {
    this.equipment.getDatosPatron().subscribe({
      next: (res) => {
        this.patrones = res;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error patrones:', err);
        this.alertService.error('No se pudieron cargar los patrones.', 'Error');
        this.cdr.detectChanges();
      },
    });
  }

  cargarEquipos(): void {
    this.equipment.getDatosEquipos().subscribe({
      next: (res) => {
        this.equipos = res;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error equipos:', err);
        this.alertService.error('No se pudieron cargar los equipos.', 'Error');
        this.cdr.detectChanges();
      },
    });
  }

  // ============================================================
  //  MÉTODOS DEL CROPPER / IMAGEN
  // ============================================================
  onPaste(event: ClipboardEvent): void {
    if (!this.isBrowser) return;
    const items = event.clipboardData?.items;
    if (!items) return;

    let imagenEncontrada = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          this.imageChangedEvent = null;
          this.croppedImageBase64 = '';
          this.pasteImageFile = new File(
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
      this.alertService.warning(
        'El contenido pegado no es una imagen válida.',
        'Pegar imagen'
      );
    }
  }

  fileChangeEvent(event: Event): void {
    this.pasteImageFile = undefined;
    this.croppedImageBase64 = '';
    this.imageChangedEvent = event;
  }

  imageCropped(event: ImageCroppedEvent): void {
    const base64 = event.base64 ?? null;
    if (base64) {
      this.croppedImageBase64 = base64;
      return;
    }

    const objectUrl = event.objectUrl ?? null;
    if (objectUrl && this.isBrowser) {
      this.blobToBase64(objectUrl).then((b64) => {
        this.croppedImageBase64 = b64;
        this.cdr.detectChanges();
      });
    }
  }

  imageLoaded(_image?: LoadedImage): void {
    this.cdr.detectChanges();
  }

  cropperReady(): void {
    /* El cropper está listo para interacción */
  }

  loadImageFailed(): void {
    this.alertService.error(
      'Error al cargar la imagen. Intenta con otra captura o archivo.',
      'Carga de imagen'
    );
  }

  private blobToBase64(blobUrl: string): Promise<string> {
    if (!this.isBrowser) return Promise.resolve('');
    return fetch(blobUrl)
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result ?? ''));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          })
      );
  }

  // ============================================================
  //  MODO DE EXTRACCIÓN
  // ============================================================
  setModo(modo: 'single' | 'multi'): void {
    if (this.ocrEnProceso) {
      this.alertService.info(
        'Espera a que termine el proceso en curso.',
        'Procesando'
      );
      return;
    }
    this.modoExtraccion = modo;
    this.multiState.error = null;
    this.cdr.detectChanges();
  }

  // ============================================================
  //  MULTI-IMAGEN: helpers de estado
  // ============================================================
  private crearMultiStateVacio(): MultiImageState {
    return {
      items: [],
      abierto: false,
      procesando: false,
      error: null,
      cargandoArchivos: false,
    };
  }

  toggleMultiPanel(): void {
    this.multiState.abierto = !this.multiState.abierto;
    this.multiState.error = null;
    this.cdr.detectChanges();
  }

  // ============================================================
  //  MULTI-IMAGEN: carga de archivos
  // ============================================================
  onMultiFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const files = Array.from(input.files);
    void this.agregarArchivosMultiples(files);
    input.value = '';
  }

  onMultiPaste(event: ClipboardEvent): void {
    if (!this.isBrowser) return;
    const items = event.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) {
          files.push(new File([f], `pegada_${Date.now()}_${i}.png`, { type: f.type }));
        }
      }
    }
    if (files.length === 0) {
      this.alertService.warning(
        'El contenido pegado no contiene imágenes válidas.',
        'Pegar imágenes'
      );
      return;
    }
    event.preventDefault();
    void this.agregarArchivosMultiples(files);
  }

  private async agregarArchivosMultiples(files: File[]): Promise<void> {
    const validos = files.filter((f) => /^image\//.test(f.type));
    if (validos.length === 0) {
      this.alertService.error(
        'Los archivos seleccionados no son imágenes.',
        'Tipo inválido'
      );
      return;
    }

    this.multiState.cargandoArchivos = true;
    this.multiState.error = null;
    this.cdr.detectChanges();

    try {
      for (const f of validos) {
        const base64 = await this.fileToBase64(f);
        this.multiState.items.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          base64,
          nombre: f.name || 'imagen',
        });
      }
    } catch (e: any) {
      this.multiState.error =
        'No se pudieron leer algunos archivos: ' +
        (e?.message ?? 'error desconocido');
    } finally {
      this.multiState.cargandoArchivos = false;
      this.cdr.detectChanges();
    }
  }

  private fileToBase64(file: File): Promise<string> {
    if (!this.isBrowser) return Promise.resolve('');
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  quitarItemMulti(itemId: string): void {
    this.multiState.items = this.multiState.items.filter((i) => i.id !== itemId);
    this.multiState.error = null;
    this.cdr.detectChanges();
  }

  moverItemMulti(itemId: string, direccion: -1 | 1): void {
    const items = this.multiState.items;
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx < 0) return;
    const nuevo = idx + direccion;
    if (nuevo < 0 || nuevo >= items.length) return;
    const [item] = items.splice(idx, 1);
    items.splice(nuevo, 0, item);
    this.multiState.error = null;
    this.cdr.detectChanges();
  }

  limpiarMulti(): void {
    this.multiState.items = [];
    this.multiState.error = null;
    this.cdr.detectChanges();
  }

  // ============================================================
  //  ENVIAR 1 IMAGEN AL SERVIDOR
  // ============================================================
  enviarANode(): void {
    if (this.ocrEnProceso) {
      this.alertService.info('Ya hay un proceso en curso.', 'Espera');
      return;
    }

    if (!this.pasteImageFile && !this.imageChangedEvent) {
      this.alertService.warning(
        'Por favor selecciona o pega una imagen primero.',
        'Sin imagen'
      );
      return;
    }

    if (!this.croppedImageBase64) {
      this.alertService.warning(
        'Ajusta el área de selección sobre la tabla antes de extraer.',
        'Área no definida'
      );
      return;
    }

    this.cargando = true;
    this.ocrEnProceso = true;
    this.mostrarTabla = false;
    this.tablaHeaders = [];
    this.tablaRows = [];
    this.tablaTexto = '';
    this.cdr.detectChanges();

    this.imageService
      .procesarTabla(this.croppedImageBase64)
      .subscribe({
        next: (res) => this.procesarRespuestaSimple(res),
        error: (err) => {
          console.error('Error en servidor:', err);
          this.alertService.error(
            'Ocurrió un error al procesar la tabla en el servidor.',
            'Servidor'
          );
        },
      })
      .add(() => {
        this.cargando = false;
        this.ocrEnProceso = false;
        this.cdr.detectChanges();
      });
  }

  private procesarRespuestaSimple(res: any): void {
    const html = res?.table;
    if (res?.success && typeof html === 'string' && html.trim()) {
      this.tablaTexto = html;
      const tableText = html.trim();
      if (tableText.startsWith('<table')) {
        this.parseTableHtml(tableText);
      } else {
        this.parseTableText(tableText);
      }
      this.mostrarTabla = this.tablaHeaders.length > 0;
      if (this.mostrarTabla) {
        this.alertService.success('Tabla extraída correctamente.', 'OCR');
      }
    } else {
      this.alertService.error(
        'No se pudo extraer la tabla del servidor.',
        'OCR'
      );
    }
    console.log('Respuesta del servidor:', html);
  }

  // ============================================================
  //  ENVIAR N IMÁGENES AL SERVIDOR (unión vertical)
  // ============================================================
  enviarMultiANode(): void {
    if (this.ocrEnProceso || this.multiState.procesando) {
      this.alertService.info('Ya hay un proceso en curso.', 'Espera');
      return;
    }

    if (this.multiState.items.length < 1) {
      this.alertService.warning('Selecciona al menos una imagen.', 'Sin imágenes');
      return;
    }

    this.cargando = true;
    this.ocrEnProceso = true;
    this.multiState.procesando = true;
    this.multiState.error = null;
    this.mostrarTabla = false;
    this.tablaHeaders = [];
    this.tablaRows = [];
    this.tablaTexto = '';
    this.cdr.detectChanges();

    const base64List = this.multiState.items.map((i) => i.base64);
    const order = this.multiState.items.map((_, idx) => idx);

    this.imageService
      .procesarTablasMultiples(base64List, order)
      .subscribe({
        next: (res) => {
          const html = res?.table;
          if (res?.success && typeof html === 'string' && html.trim()) {
            this.tablaTexto = html;
            const tableText = html.trim();
            if (tableText.startsWith('<table')) {
              this.parseTableHtml(tableText);
            } else {
              this.parseTableText(tableText);
            }
            this.mostrarTabla = this.tablaHeaders.length > 0;

            if (this.mostrarTabla) {
              const imagenes = res?.metadata?.imagesProcessed ?? base64List.length;
              const cols = res?.metadata?.columnsDetected ?? this.tablaHeaders.length;
              this.alertService.success(
                `${imagenes} imagen(es) unidas en una tabla de ${cols} columna(s).`,
                'OCR multi-imagen'
              );
            } else {
              const errMsg = 'No se pudo extraer una tabla válida del resultado unificado.';
              this.multiState.error = errMsg;
              this.alertService.error(errMsg, 'OCR multi-imagen');
            }
          } else {
            const errMsg = res?.error || 'El servidor no devolvió una tabla unificada.';
            this.multiState.error = errMsg;
            this.alertService.error(errMsg, 'OCR multi-imagen');
          }
        },
        error: (err) => {
          console.error('Error en servidor (multi):', err);
          // 422 → columnas inconsistentes; mostramos el detalle del backend
          const backendMsg: string =
            err?.error?.error ||
            err?.message ||
            'Error desconocido al unir las imágenes.';
          this.multiState.error = backendMsg;
          this.alertService.error(
            backendMsg,
            'No se pudieron unir las tablas'
          );
        },
      })
      .add(() => {
        this.cargando = false;
        this.ocrEnProceso = false;
        this.multiState.procesando = false;
        this.cdr.detectChanges();
      });
  }

  // ============================================================
  //  EXPORTAR A EXCEL
  // ============================================================
  exportToExcel(): void {
    if (!this.isBrowser) return;

    if (this.tablaHeaders.length === 0 || this.tablaRows.length === 0) {
      this.alertService.warning(
        'No hay datos en la tabla para exportar.',
        'Exportar'
      );
      return;
    }

    try {
      const wsData: (string | number)[][] = [
        this.tablaHeaders,
        ...this.tablaRows,
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = this.tablaHeaders.map((h, i) => {
        const maxLen = Math.max(
          h.length,
          ...this.tablaRows.map((r) => (r[i] ?? '').toString().length)
        );
        return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tabla OCR');

      const filename = `tabla_ocr_${new Date()
        .toISOString()
        .slice(0, 10)}_${Date.now()}.xlsx`;

      XLSX.writeFile(wb, filename);

      this.alertService.success(
        `Archivo "${filename}" generado correctamente.`,
        'Exportar a Excel'
      );
    } catch (err) {
      console.error('Error al exportar:', err);
      this.alertService.error(
        'No se pudo generar el archivo Excel.',
        'Exportar'
      );
    }
  }

  // ============================================================
  //  PARSEADOR DE TEXTO CON PIPES
  // ============================================================
  private parseTableText(text: string): void {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      this.alertService.error(
        'El texto extraído no contiene una tabla válida.',
        'Parseo'
      );
      return;
    }

    const normalizedLines = lines.map((line) => {
      if (line.includes('\t')) return line.replace(/\t/g, ' | ');
      if (line.includes(';')) return line.replace(/;/g, ' | ');
      if (line.includes('|') && !line.includes(' | '))
        return line.replace(/\|/g, ' | ');
      if (line.match(/\s{2,}/)) return line.replace(/\s{2,}/g, ' | ');
      return line;
    });

    const separator = ' | ';
    const headers = normalizedLines[0]
      .split(separator)
      .map((h) => h.trim())
      .filter((h) => h.length > 0);

    if (headers.length === 0) {
      this.alertService.error(
        'No se encontraron encabezados de columna.',
        'Parseo'
      );
      return;
    }

    const rows: string[][] = [];
    for (let i = 1; i < normalizedLines.length; i++) {
      const line = normalizedLines[i];
      let cells = line.split(separator).map((c) => c.trim());
      while (cells.length < headers.length) cells.push('');
      if (cells.length > headers.length) cells = cells.slice(0, headers.length);
      rows.push(cells);
    }

    this.tablaHeaders = headers;
    this.tablaRows = rows;
  }

  // ============================================================
  //  PARSEADOR DE HTML (detecta encabezados duplicados y rowspan)
  // ============================================================
  private parseTableHtml(html: string): void {
    if (!this.isBrowser) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tables = doc.querySelectorAll('table');
    if (tables.length === 0) {
      this.alertService.error(
        'No se encontró tabla en el HTML extraído.',
        'Parseo'
      );
      return;
    }

    const table = tables[0];
    const allRows = table.querySelectorAll('tr');
    if (allRows.length === 0) return;

    function isHeaderRow(row: Element): boolean {
      const cells = row.querySelectorAll('th, td');
      let textCells = 0;
      cells.forEach((cell) => {
        const text = cell.textContent?.trim() || '';
        if (text === '') return;
        if (/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(text)) {
          textCells++;
        } else {
          const num = parseFloat(
            text.replace(',', '.').replace(/[^0-9.-]/g, '')
          );
          if (isNaN(num)) textCells++;
        }
      });
      return cells.length > 0 && textCells / cells.length > 0.5;
    }

    let headerRowIndex = 0;
    let dataStartIndex = 1;
    let foundHeader = false;

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      if (row.querySelector('th') !== null || isHeaderRow(row)) {
        headerRowIndex = i;
        foundHeader = true;
        dataStartIndex = i + 1;
        break;
      }
    }

    if (!foundHeader) {
      headerRowIndex = 0;
      dataStartIndex = 1;
    }

    const headerRow = allRows[headerRowIndex];
    const headerCells = headerRow.querySelectorAll('th, td');

    const headers: string[] = [];
    let celdasHeaderVaciasDescartadas = 0;
    headerCells.forEach((cell) => {
      const text = cell.textContent?.trim() || '';
      const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
      if (text === '') {
        for (let c = 1; c < colspan; c++) headers.push('');
        celdasHeaderVaciasDescartadas++;
        return;
      }
      headers.push(text);
      for (let c = 1; c < colspan; c++) headers.push(text);
    });

    if (headers.length === 0) {
      this.alertService.error(
        'No se encontraron encabezados de columna.',
        'Parseo'
      );
      return;
    }

    const dataRows = Array.from(allRows).slice(dataStartIndex);
    if (dataRows.length === 0) {
      this.alertService.error(
        'No se encontraron filas de datos en la tabla.',
        'Parseo'
      );
      return;
    }

    const activeRowspan: {
      [col: number]: { value: string; remaining: number };
    } = {};
    const rowsData: string[][] = [];

    let celdasVaciasDescartadas = celdasHeaderVaciasDescartadas;

    dataRows.forEach((row) => {
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

          if (value === '' && rowspan <= 1 && colspan <= 1) {
            cellIndex++;
            celdasVaciasDescartadas++;
            continue;
          }

          rowData[col] = value;
          if (rowspan > 1) {
            activeRowspan[col] = { value, remaining: rowspan - 1 };
          }
          for (let c = 1; c < colspan; c++) {
            if (col + c < headers.length) rowData[col + c] = value;
          }
          cellIndex++;
          break;
        }
      }

      const tieneAlgunValor = rowData.some((v) => v !== '');
      if (!tieneAlgunValor) {
        celdasVaciasDescartadas++;
        return;
      }

      rowsData.push(rowData);
    });

    const lastValues: string[] = new Array(headers.length).fill('');
    const finalData: string[][] = [];
    rowsData.forEach((row) => {
      const newRow: string[] = [];
      for (let col = 0; col < headers.length; col++) {
        let val = row[col];
        if (val === '' && lastValues[col] !== '') val = lastValues[col];
        newRow.push(val);
        if (val !== '') lastValues[col] = val;
      }
      finalData.push(newRow);
    });

    this.tablaHeaders = headers;
    this.tablaRows = finalData;
    this.mostrarTabla = true;

    if (celdasVaciasDescartadas > 0) {
      this.alertService.info(
        `Se ignoraron ${celdasVaciasDescartadas} celda(s) vacía(s) que rompían la estructura de la tabla. ` +
        `La tabla se muestra sin esos huecos.`,
        'Celdas vacías eliminadas'
      );
    }
  }
}