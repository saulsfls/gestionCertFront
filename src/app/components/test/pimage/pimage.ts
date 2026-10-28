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

import { ImageService } from '../../../services/database/image.service';
import { EquipmentService } from '../../../services/database/equipment.service';
import { AlertService } from '../../../services/core/alert.service';

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
    if (event.base64) {
      this.croppedImageBase64 = event.base64;
    } else if (event.objectUrl && this.isBrowser) {
      this.blobToBase64(event.objectUrl).then((base64) => {
        this.croppedImageBase64 = base64;
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
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          })
      );
  }

  // ============================================================
  //  ENVIAR IMAGEN AL SERVIDOR Y PROCESAR RESPUESTA
  // ============================================================
  enviarANode(): void {
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
    this.mostrarTabla = false;
    this.tablaHeaders = [];
    this.tablaRows = [];
    this.tablaTexto = '';
    this.cdr.detectChanges();

    this.imageService
      .procesarTabla(this.croppedImageBase64)
      .subscribe({
        next: (res) => {
          if (res.success && res.table) {
            this.tablaTexto = res.table;
            const tableText = res.table.trim();
            if (tableText.startsWith('<table')) {
              this.parseTableHtml(tableText);
            } else {
              this.parseTableText(tableText);
            }
            this.mostrarTabla = this.tablaHeaders.length > 0;
            if (this.mostrarTabla) {
              this.alertService.success(
                'Tabla extraída correctamente.',
                'OCR'
              );
            }
          } else {
            this.alertService.error(
              'No se pudo extraer la tabla del servidor.',
              'OCR'
            );
          }
          console.log('Respuesta del servidor:', res.table);
        },
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

      // Ancho automático de columnas
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
    headerCells.forEach((cell) =>
      headers.push(cell.textContent?.trim() || '')
    );

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

    dataRows.forEach((row) => {
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
          if (rowspan > 1) {
            activeRowspan[col] = { value, remaining: rowspan - 1 };
          }
          for (let c = 1; c < colspan; c++) {
            if (col + c < headers.length) rowData[col + c] = value;
          }
          cellIndex++;
        }
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
  }
}
