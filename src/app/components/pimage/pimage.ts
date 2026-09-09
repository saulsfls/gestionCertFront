import { Component, ChangeDetectorRef, inject, PLATFORM_ID, OnInit } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ImageCropperComponent, ImageCroppedEvent, LoadedImage } from 'ngx-image-cropper';
import { ImageService } from '../../services/image.service';

@Component({
  selector: 'app-pimage',
  standalone: true,
  imports: [CommonModule, ImageCropperComponent],
  templateUrl: './pimage.html',
  styleUrl: './pimage.css',
})
export class Pimage implements OnInit {
  private platformId = inject(PLATFORM_ID);
  isBrowser: boolean = isPlatformBrowser(this.platformId);

  imageChangedEvent: Event | null = null;
  pasteImageFile: File | undefined = undefined;
  croppedImageBase64: string = '';
  cargando: boolean = false;

  // Propiedades para la tabla
  tablaHeaders: string[] = [];
  tablaRows: string[][] = [];
  mostrarTabla: boolean = false;
  tablaTexto: string = ''; // para depuración

  mensajeError: string = '';
  mensajeExito: string = '';

  constructor(
    private imageService: ImageService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log(this.imageService.getHealth());
  }

  // ========== MÉTODOS EXISTENTES (sin cambios) ==========
  onPaste(event: ClipboardEvent): void {
    if (!this.isBrowser) return;
    this.limpiarMensajes();
    const items = event.clipboardData?.items;
    if (!items) return;

    let imagenEncontrada = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          this.imageChangedEvent = null;
          this.croppedImageBase64 = '';
          this.pasteImageFile = new File([file], `pasted_image_${Date.now()}.png`, { type: file.type });
          this.cdr.detectChanges();
          imagenEncontrada = true;
        }
        break;
      }
    }

    if (!imagenEncontrada) {
      this.mensajeError = 'El contenido pegado no es una imagen válida.';
    }
  }

  fileChangeEvent(event: Event): void {
    this.limpiarMensajes();
    this.pasteImageFile = undefined;
    this.croppedImageBase64 = '';
    this.imageChangedEvent = event;
  }

  imageCropped(event: ImageCroppedEvent): void {
    if (event.base64) {
      this.croppedImageBase64 = event.base64;
    } else if (event.objectUrl && this.isBrowser) {
      this.blobToBase64(event.objectUrl).then(base64 => {
        this.croppedImageBase64 = base64;
      });
    }
  }

  imageLoaded(image?: LoadedImage): void {
    this.cdr.detectChanges();
  }

  cropperReady(): void {
    // El cropper está listo para interacción
  }

  loadImageFailed(): void {
    this.mensajeError = 'Error al cargar la imagen. Intenta con otra captura o archivo.';
  }

  private blobToBase64(blobUrl: string): Promise<string> {
    if (!this.isBrowser) return Promise.resolve('');
    return fetch(blobUrl)
      .then(r => r.blob())
      .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }));
  }

  // ========== ENVIAR Y PROCESAR RESPUESTA ==========
  enviarANode(): void {
    this.limpiarMensajes();

    if (!this.pasteImageFile && !this.imageChangedEvent) {
      this.mensajeError = 'Por favor selecciona o pega una imagen primero.';
      return;
    }

    if (!this.croppedImageBase64) {
      this.mensajeError = 'Ajusta el área de selección sobre la tabla antes de extraer.';
      return;
    }

    this.cargando = true;
    this.mostrarTabla = false;
    this.tablaHeaders = [];
    this.tablaRows = [];
    this.tablaTexto = '';
    this.cdr.detectChanges();

    this.imageService.procesarTabla(this.croppedImageBase64).subscribe({
      next: (res) => {
        if (res.success && res.table) {
          this.tablaTexto = res.table;
          const tableText = res.table.trim();
          // Detectar si es HTML
          if (tableText.startsWith('<table')) {
            this.parseTableHtml(tableText);
          } else {
            this.parseTableText(tableText);
          }
          this.mostrarTabla = true;
          this.mensajeExito = 'Tabla extraída correctamente.';
        } else {
          this.mensajeError = 'No se pudo extraer la tabla.';
        }
        console.log('Respuesta del servidor:', res.table);
      },
      error: (err) => {
        console.error('Error en servidor:', err);
        this.mensajeError = 'Ocurrió un error al procesar la tabla en el servidor.';
      }
    }).add(() => {
      this.cargando = false;
      this.cdr.detectChanges();
    });
  }

  // ========== PARSEADOR DE TEXTO CON PIPES (ya existente) ==========
  private parseTableText(text: string): void {
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length < 2) {
      this.mensajeError = 'El texto extraído no contiene una tabla válida.';
      return;
    }

    // Normalizar separadores
    let normalizedLines = lines.map(line => {
      if (line.includes('\t')) return line.replace(/\t/g, ' | ');
      if (line.includes(';')) return line.replace(/;/g, ' | ');
      if (line.includes('|') && !line.includes(' | ')) return line.replace(/\|/g, ' | ');
      if (line.match(/\s{2,}/)) return line.replace(/\s{2,}/g, ' | ');
      return line;
    });

    const separator = ' | ';
    const headers = normalizedLines[0].split(separator)
      .map(h => h.trim())
      .filter(h => h.length > 0);

    if (headers.length === 0) {
      this.mensajeError = 'No se encontraron encabezados de columna.';
      return;
    }

    const rows: string[][] = [];
    for (let i = 1; i < normalizedLines.length; i++) {
      const line = normalizedLines[i];
      let cells = line.split(separator).map(c => c.trim());
      while (cells.length < headers.length) cells.push('');
      if (cells.length > headers.length) cells = cells.slice(0, headers.length);
      rows.push(cells);
    }

    this.tablaHeaders = headers;
    this.tablaRows = rows;
  }

 // ========== PARSEADOR DE HTML MEJORADO (detecta encabezados duplicados) ==========
private parseTableHtml(html: string): void {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const tables = doc.querySelectorAll('table');
  if (tables.length === 0) {
    this.mensajeError = 'No se encontró tabla en el HTML.';
    return;
  }

  const table = tables[0];
  const allRows = table.querySelectorAll('tr');
  if (allRows.length === 0) return;

  // Función auxiliar: detectar si una fila parece encabezado (contiene texto no numérico)
  function isHeaderRow(row: Element): boolean {
    const cells = row.querySelectorAll('th, td');
    let textCells = 0;
    let numericCells = 0;
    cells.forEach(cell => {
      const text = cell.textContent?.trim() || '';
      if (text === '') return;
      // Si contiene al menos una letra (no es solo número y punto/comas)
      if (/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(text)) {
        textCells++;
      } else {
        // Si es número o parece número
        const num = parseFloat(text.replace(',', '.').replace(/[^0-9.-]/g, ''));
        if (!isNaN(num)) {
          numericCells++;
        } else {
          textCells++; // si no es número, lo consideramos texto
        }
      }
    });
    // Si más del 50% de las celdas tienen texto, es encabezado
    return (textCells / cells.length) > 0.5;
  }

  // Buscar la primera fila que sea encabezado (usando th o contenido)
  let headerRowIndex = 0;
  let dataStartIndex = 1;
  let foundHeader = false;

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const hasTh = row.querySelector('th') !== null;
    if (hasTh) {
      headerRowIndex = i;
      foundHeader = true;
      dataStartIndex = i + 1;
      break;
    }
    // Si no tiene th, pero parece encabezado por contenido
    if (isHeaderRow(row)) {
      headerRowIndex = i;
      foundHeader = true;
      dataStartIndex = i + 1;
      break;
    }
  }

  // Si no se encontró encabezado, usar la primera fila como encabezado y datos desde la segunda
  if (!foundHeader) {
    headerRowIndex = 0;
    dataStartIndex = 1;
  }

  // Extraer encabezados de la fila seleccionada
  const headerRow = allRows[headerRowIndex];
  const headerCells = headerRow.querySelectorAll('th, td');
  const headers: string[] = [];
  headerCells.forEach(cell => {
    let text = cell.textContent?.trim() || '';
    // Limpiar unidades entre paréntesis si se desea (opcional)
    // text = text.replace(/\(.*\)/, '').trim();
    headers.push(text);
  });

  // Ahora procesar las filas de datos (desde dataStartIndex)
  const dataRows = Array.from(allRows).slice(dataStartIndex);
  if (dataRows.length === 0) {
    this.mensajeError = 'No se encontraron filas de datos.';
    return;
  }

  // Almacenar valores con rowspan activos
  const activeRowspan: { [col: number]: { value: string, remaining: number } } = {};
  const rowsData: string[][] = [];

  dataRows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    const rowData: string[] = new Array(headers.length).fill('');

    // Rellenar con rowspan activos
    for (let col = 0; col < headers.length; col++) {
      if (activeRowspan[col] && activeRowspan[col].remaining > 0) {
        rowData[col] = activeRowspan[col].value;
        activeRowspan[col].remaining--;
        if (activeRowspan[col].remaining === 0) {
          delete activeRowspan[col];
        }
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
        // Para colspan, repetir valor en columnas adicionales
        for (let c = 1; c < colspan; c++) {
          if (col + c < headers.length) {
            rowData[col + c] = value;
          }
        }
        cellIndex++;
      }
    }

    rowsData.push(rowData);
  });

  // Propagar valores hacia abajo para celdas vacías (como rowspan no capturado)
  const lastValues: string[] = new Array(headers.length).fill('');
  const finalData: string[][] = [];
  rowsData.forEach(row => {
    const newRow: string[] = [];
    for (let col = 0; col < headers.length; col++) {
      let val = row[col];
      if (val === '' && lastValues[col] !== '') {
        val = lastValues[col];
      }
      newRow.push(val);
      if (val !== '') {
        lastValues[col] = val;
      }
    }
    finalData.push(newRow);
  });

  this.tablaHeaders = headers;
  this.tablaRows = finalData;
  this.mostrarTabla = true;
}

  private limpiarMensajes(): void {
    this.mensajeError = '';
    this.mensajeExito = '';
  }
}
