import {
  Component,
  ChangeDetectorRef,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

import { ImageService } from '../../../services/database/external/image.service';
import { AlertService } from '../../../services/core/alert.service';
import * as XLSX from 'xlsx';

interface ImageItem {
  id: string;
  file: File;
  base64: string;
  nombre: string;
}

@Component({
  selector: 'app-pimage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pimage.html',
  styleUrl: './pimage.css',
})
export class Pimage {
  private platformId = inject(PLATFORM_ID);
  isBrowser: boolean = isPlatformBrowser(this.platformId);
  private alertService = inject(AlertService);

  items: ImageItem[] = [];
  cargandoArchivos: boolean = false;
  cargando: boolean = false;
  ocrEnProceso: boolean = false;
  error: string | null = null;
  zonaActiva: boolean = false;

  tablaHeaders: string[] = [];
  tablaRows: string[][] = [];
  mostrarTabla: boolean = false;
  tablaTexto: string = '';

  constructor(
    private imageService: ImageService,
    private cdr: ChangeDetectorRef
  ) {}

  // ========== CARGA UNIVERSAL ==========
  onPasteUniversal(event: ClipboardEvent): void {
    if (!this.isBrowser || this.ocrEnProceso) return;
    const files = this.extraerImagenesDeClipboard(event);
    if (files.length === 0) {
      this.alertService.warning(
        'El contenido pegado no contiene imágenes válidas.',
        'Pegar imagen'
      );
      return;
    }
    event.preventDefault();
    void this.agregarArchivos(files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDropUniversal(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isBrowser || this.ocrEnProceso) return;

    const files: File[] = [];
    const dropped = event.dataTransfer?.files;
    if (dropped && dropped.length > 0) {
      for (let i = 0; i < dropped.length; i++) {
        if (dropped[i].type.startsWith('image/')) files.push(dropped[i]);
      }
    }
    if (files.length === 0) {
      this.alertService.warning(
        'Los archivos arrastrados no son imágenes válidas.',
        'Arrastrar imágenes'
      );
      return;
    }
    void this.agregarArchivos(files);
  }

  private extraerImagenesDeClipboard(event: ClipboardEvent): File[] {
    const items = event.clipboardData?.items;
    if (!items) return [];
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) {
          files.push(
            new File([f], `pegada_${Date.now()}_${i}.png`, { type: f.type })
          );
        }
      }
    }
    return files;
  }

  private async agregarArchivos(files: File[]): Promise<void> {
    const validos = files.filter((f) => /^image\//.test(f.type));
    if (validos.length === 0) {
      this.alertService.error(
        'Los archivos seleccionados no son imágenes.',
        'Tipo inválido'
      );
      return;
    }

    this.cargandoArchivos = true;
    this.error = null;
    this.cdr.detectChanges();

    try {
      for (const f of validos) {
        const base64 = await this.fileToBase64(f);
        this.items.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          base64,
          nombre: f.name || 'imagen',
        });
      }
    } catch (e: any) {
      this.error =
        'No se pudieron leer algunos archivos: ' +
        (e?.message ?? 'error desconocido');
    } finally {
      this.cargandoArchivos = false;
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

  quitarItem(itemId: string): void {
    this.items = this.items.filter((i) => i.id !== itemId);
    this.error = null;
    this.cdr.detectChanges();
  }

  moverItem(itemId: string, direccion: -1 | 1): void {
    const idx = this.items.findIndex((i) => i.id === itemId);
    if (idx < 0) return;
    const nuevo = idx + direccion;
    if (nuevo < 0 || nuevo >= this.items.length) return;
    const [item] = this.items.splice(idx, 1);
    this.items.splice(nuevo, 0, item);
    this.error = null;
    this.cdr.detectChanges();
  }

  // ========== ENVÍO AL SERVIDOR ==========
  enviarANode(): void {
    if (this.ocrEnProceso) {
      this.alertService.info('Ya hay un proceso en curso.', 'Espera');
      return;
    }
    if (this.items.length === 0) {
      this.alertService.warning('Selecciona al menos una imagen.', 'Sin imágenes');
      return;
    }

    this.cargando = true;
    this.ocrEnProceso = true;
    this.error = null;
    this.mostrarTabla = false;
    this.tablaHeaders = [];
    this.tablaRows = [];
    this.tablaTexto = '';
    this.cdr.detectChanges();

    const base64List = this.items.map((i) => i.base64);
    const order = this.items.map((_, idx) => idx);

    this.imageService
      .procesarTablasMultiples(base64List, order)
      .subscribe({
        next: (res) => this.procesarRespuesta(res),
        error: (err) => {
          console.error('Error en servidor:', err);
          const backendMsg: string =
            err?.error?.error ||
            err?.message ||
            'Error desconocido al procesar las imágenes.';
          this.error = backendMsg;
          this.alertService.error(backendMsg, 'OCR');
        },
      })
      .add(() => {
        this.cargando = false;
        this.ocrEnProceso = false;
        this.cdr.detectChanges();
      });
  }

  private procesarRespuesta(res: any): void {
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
      } else {
        const errMsg = 'No se pudo extraer una tabla válida del resultado.';
        this.error = errMsg;
        this.alertService.error(errMsg, 'OCR');
      }
    } else {
      const errMsg =
        res?.error || 'El servidor no devolvió una tabla unificada.';
      this.error = errMsg;
      this.alertService.error(errMsg, 'OCR');
    }
    console.log('Respuesta del servidor:', html);
  }

  // ========== PARSEADORES ==========
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
}