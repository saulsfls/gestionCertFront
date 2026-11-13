import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CertService } from '../../../services/database/cert.service';
import { FormsModule } from '@angular/forms';
import { AlertService } from '../../../services/core/alert.service';
import { Workbook } from 'exceljs';
import { Certificado, ResultTable } from '../../../models/certificado.models';
import { finalize } from 'rxjs/operators';

export type FiltroEstado = 'todos' | 'activos' | 'inactivos';

@Component({
  selector: 'app-viewcert',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './viewcert.html',
  styleUrl: './viewcert.css',
})
export class Viewcert implements OnInit {

  private readonly alert = inject(AlertService);

  certificado: Certificado | null = null;
  resultTables: ResultTable[] = [];
  /** Tablas filtradas según el término de búsqueda */
  filteredTables: ResultTable[] = [];
  loading = false;
  errorMsg: string | null = null;

  /** Texto de búsqueda de tablas */
  searchTerm = '';

  /** Estado de colapso por índice de tabla (true = colapsada) */
  collapsedTables: { [index: number]: boolean } = {};

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private certService: CertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadDetail(id);
    } else {
      this.errorMsg = 'No certificate ID provided.';
      this.alert.error('No se proporcionó un ID de certificado.', 'Error de navegación');
    }
  }

  loadDetail(id: string | number): void {
    this.loading = true;
    this.errorMsg = null;
    this.certificado = null;
    this.resultTables = [];
    this.filteredTables = [];
    this.searchTerm = '';
    this.collapsedTables = {};

    this.certService
      .obtenerCertificadoPorId(id)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (res: any) => {
          const data: Certificado = res.data || res;
          if (!data) {
            this.errorMsg = 'No certificate data received.';
            this.alert.error('No se recibieron datos del certificado.', 'Sin datos');
            return;
          }
          this.certificado = data;

          const tablesData = data.data?.['Result Tables'] || [];
          if (tablesData && Array.isArray(tablesData)) {
            this.resultTables = tablesData.map((t: any) => ({
              title: t.title || '',
              equipment_id: t.equipment_id || this.certificado?.equipment_id || '',
              cc_id: t.cc_id || this.certificado?.cc || '',
              pt: t.pt || '',
              table_id: t.table_id || '',
              parameter: t.parameter || '',
              unit: t.unit || '',
              calibration_equation: t.calibration_equation || '',
              range: t.range || '',
              comments: t.comments || '',
              columns: t.columns || [],
              rows: t.rows || []
            }));
          } else {
            this.resultTables = [];
          }

          // Inicializar filtro
          this.applyFilter();
          this.errorMsg = null;
        },
        error: (err) => {
          this.errorMsg = err.error?.message || 'Error loading the certificate.';
          this.alert.error(this.errorMsg ?? 'Error al cargar el certificado.', 'Error');
        }
      });
  }

  // ============================================================
  // BÚSQUEDA DE TABLAS
  // ============================================================

  /** Filtra las tablas según el término de búsqueda */
  applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();

    if (!term) {
      this.filteredTables = [...this.resultTables];
      return;
    }

    this.filteredTables = this.resultTables.filter(t => {
      const haystack = [
        t.title,
        t.parameter,
        t.unit,
        t.pt,
        t.table_id,
        t.cc_id,
        t.equipment_id,
        t.range,
        t.comments,
        t.calibration_equation,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      // También busca en encabezados de columna y valores de filas
      const cols = (t.columns || [])
        .map(c => `${c.label || ''} ${c.key || ''} ${c.unit || ''}`)
        .join(' ')
        .toLowerCase();

      const rowsText = (t.rows || [])
        .map(r => Object.values(r).join(' '))
        .join(' ')
        .toLowerCase();

      return (
        haystack.includes(term) ||
        cols.includes(term) ||
        rowsText.includes(term)
      );
    });
  }

  /** Limpia la búsqueda */
  clearSearch(): void {
    this.searchTerm = '';
    this.applyFilter();
  }

  /** Índice real (en resultTables) para una tabla filtrada */
  private realIndex(table: ResultTable): number {
    return this.resultTables.indexOf(table);
  }

  // ============================================================
  // COLAPSAR / EXPANDIR TABLAS
  // ============================================================

  isCollapsed(table: ResultTable): boolean {
    const idx = this.realIndex(table);
    return idx >= 0 ? !!this.collapsedTables[idx] : false;
  }

  toggleCollapse(table: ResultTable, event?: Event): void {
    if (event) event.stopPropagation();
    const idx = this.realIndex(table);
    if (idx < 0) return;
    this.collapsedTables[idx] = !this.collapsedTables[idx];
  }

  expandAll(): void {
    this.filteredTables.forEach(t => {
      const idx = this.realIndex(t);
      if (idx >= 0) this.collapsedTables[idx] = false;
    });
  }

  collapseAll(): void {
    this.filteredTables.forEach(t => {
      const idx = this.realIndex(t);
      if (idx >= 0) this.collapsedTables[idx] = true;
    });
  }

  /** Indica si al menos una tabla visible está colapsada */
  get hasCollapsed(): boolean {
    return this.filteredTables.some(t => this.isCollapsed(t));
  }

  /** Indica si al menos una tabla visible está expandida */
  get hasExpanded(): boolean {
    return this.filteredTables.some(t => !this.isCollapsed(t));
  }

  // ============================================================
  // COPIAR TABLA AL PORTAPAPELES (TSV para Excel)
  // ============================================================

  async copyTable(table: ResultTable, event?: Event): Promise<void> {
    if (event) event.stopPropagation();

    try {
      const headers = (table.columns || []).map(col => {
        const label = col.label || col.key || '';
        const unit = col.unit ? ` (${col.unit})` : '';
        return `${label}${unit}`;
      });

      const lines: string[] = [];

      // Título/metadata de la tabla (opcional, pero útil al pegar en Excel)
      if (table.title) lines.push(`Tabla: ${table.title}`);
      if (table.parameter) lines.push(`Parámetro: ${table.parameter}${table.unit ? ` (${table.unit})` : ''}`);
      if (table.range) lines.push(`Rango: ${table.range}`);
      if (table.calibration_equation) lines.push(`Ecuación de calibración: ${table.calibration_equation}`);
      if (table.comments) lines.push(`Comentarios: ${table.comments}`);
      if (lines.length > 0) lines.push('');

      // Encabezados
      lines.push(headers.join('\t'));

      // Filas
      (table.rows || []).forEach(row => {
        const rowData = (table.columns || []).map(col => {
          const val = row[col.key];
          return val !== undefined && val !== null ? String(val) : '';
        });
        lines.push(rowData.join('\t'));
      });

      const text = lines.join('\n');

      await this.writeToClipboard(text);

      this.alert.success(
        `Tabla "${table.title || 'sin título'}" copiada. Ya puedes pegarla en Excel.`,
        'Copiado'
      );
    } catch (err) {
      console.error('Error al copiar la tabla:', err);
      this.alert.error('No se pudo copiar la tabla al portapapeles.', 'Error');
    }
  }

  /** Copia texto al portapapeles con fallback para navegadores antiguos */
  private async writeToClipboard(text: string): Promise<void> {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
  }

  // ============================================================
  // EXPORTAR EXCEL COMPLETO (certificado + todas las tablas)
  // ============================================================

  async exportToExcel(): Promise<void> {
    if (!this.certificado) {
      this.alert.warning('No hay datos del certificado para exportar.', 'Sin datos');
      return;
    }

    try {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet('Certificado');
      const sheetData: any[][] = [];

      // Resumen del certificado
      sheetData.push(['RESUMEN DEL CERTIFICADO']);
      sheetData.push([]);

      const c = this.certificado;

      const summaryFields: Array<[string, any]> = [
        ['ID', c.id ?? ''],
        ['Equipment ID', c.equipment_id ?? ''],
        ['Nombre del Equipo', c.name_equipment ?? ''],
        ['Folio / CC', c.cc ?? ''],
        ['Fecha de Calibración', c.date_cal ?? ''],
        ['Fecha del Certificado', c.date_cc ?? ''],
        ['Intervalo de Calibración', c.calibration_interval ?? ''],
        ['Resolución', c.resolution ?? ''],
        ['Entidad Emisora', c.entity ?? ''],
        ['Tipo de Certificado', c.cert_type ?? ''],
        ['Comentarios', c.comments ?? ''],
        ['Activo', c.active ? 'Sí' : 'No'],
      ];

      summaryFields.forEach(([key, value]) => {
        sheetData.push([key, value]);
      });

      // Tablas de resultados (se exportan TODAS, no solo las filtradas)
      if (this.resultTables.length > 0) {
        sheetData.push([]);
        sheetData.push([]);
        sheetData.push(['TABLAS DE RESULTADOS']);
        sheetData.push([]);

        this.resultTables.forEach((table, idx) => {
          const tableTitle = table.title || `Tabla ${idx + 1}`;
          sheetData.push([`Tabla #${idx + 1}: ${tableTitle}`]);
          sheetData.push([]);

          const metadata: Array<[string, any]> = [
            ['Table ID', table.table_id ?? ''],
            ['CC ID', table.cc_id ?? ''],
            ['Equipment ID', table.equipment_id ?? ''],
            ['PT', table.pt ?? ''],
            ['Título', table.title ?? ''],
            ['Parámetro', table.parameter ?? ''],
            ['Unidad', table.unit ?? ''],
            ['Rango', table.range ?? ''],
            ['Ecuación de Calibración', table.calibration_equation ?? ''],
            ['Comentarios', table.comments ?? ''],
          ];

          metadata.forEach(([key, value]) => {
            sheetData.push([key, value]);
          });

          sheetData.push([]);

          const headers = (table.columns || []).map(col => {
            const label = col.label || col.key || '';
            const unit = col.unit ? ` (${col.unit})` : '';
            const type = col.type ? ` [${col.type}]` : '';
            return `${label}${unit}${type}`;
          });
          sheetData.push(headers);

          if ((table.rows || []).length > 0) {
            table.rows.forEach(row => {
              const rowData = (table.columns || []).map(col => {
                const val = row[col.key];
                return val !== undefined && val !== null ? val : '';
              });
              sheetData.push(rowData);
            });
          } else {
            sheetData.push(['Sin registros']);
          }

          if (idx < this.resultTables.length - 1) {
            sheetData.push([]);
            sheetData.push([]);
          }
        });
      } else {
        sheetData.push([]);
        sheetData.push(['No hay tablas de resultados asociadas.']);
      }

      // Volcar los datos al worksheet
      sheetData.forEach(row => {
        worksheet.addRow(row);
      });

      // Ancho automático
      const colWidths: { [key: number]: number } = {};

      worksheet.eachRow({ includeEmpty: true }, (row) => {
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const val = cell.value;
          const len = val !== undefined && val !== null ? String(val).length : 0;
          const currentMax = colWidths[colNumber] || 12;
          if (len > currentMax) {
            colWidths[colNumber] = Math.min(len, 50);
          } else if (!colWidths[colNumber]) {
            colWidths[colNumber] = 12;
          }
        });
      });

      Object.keys(colWidths).forEach(colNum => {
        const column = worksheet.getColumn(Number(colNum));
        column.width = colWidths[Number(colNum)] + 2;
      });

      worksheet.views = [{ state: 'frozen', ySplit: 3 }];

      const buffer = await workbook.xlsx?.writeBuffer();
      if (!buffer) {
        throw new Error('No se pudo generar el buffer del archivo Excel.');
      }

      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const safeId = String(c.equipment_id || c.cc || c.id || 'cert').replace(/[^\w\-]+/g, '_');
      const fileName = `Certificado_${safeId}.xlsx`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);

      this.alert.success(`Certificado exportado como "${fileName}".`, 'Excel generado');

    } catch (err: any) {
      console.error('Error al exportar a Excel:', err);
      this.alert.error('No se pudo generar el archivo Excel.', 'Error de exportación');
    }
  }

  goBack(): void {
    this.router.navigate(['/list-cert']);
  }
}
