import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CertService } from '../../../services/cert.service';
import { FormsModule } from '@angular/forms';
import { AlertService } from '../../../services/alert.service';
import * as XLSX from 'xlsx';
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
  loading = false;
  errorMsg: string | null = null;

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
              table_id: t.table_id || '',
              cmc: t.cmc || '',
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
          this.errorMsg = null;
        },
        error: (err) => {
          this.errorMsg = err.error?.message || 'Error loading the certificate.';
          this.alert.error(this.errorMsg ?? 'Error al cargar el certificado.', 'Error');
        }
      });
  }

  goBack(): void {
    this.router.navigate(['/listcert']);
  }

  exportToExcel(): void {
    if (!this.certificado) {
      this.alert.warning('No hay datos del certificado para exportar.', 'Sin datos');
      return;
    }

    try {
      const wb = XLSX.utils.book_new();
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

      // Tablas de resultados
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

          const headers = table.columns.map(col => {
            const label = col.label || col.key || '';
            const unit = col.unit ? ` (${col.unit})` : '';
            const type = col.type ? ` [${col.type}]` : '';
            return `${label}${unit}${type}`;
          });
          sheetData.push(headers);

          if (table.rows.length > 0) {
            table.rows.forEach(row => {
              const rowData = table.columns.map(col => {
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

      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      const maxCols = Math.max(...sheetData.map(r => r.length), 0);
      const colWidths: Array<{ wch: number }> = [];

      for (let i = 0; i < maxCols; i++) {
        let maxLen = 12;
        sheetData.forEach(row => {
          const cell = row[i];
          if (cell === undefined || cell === null) return;
          const len = String(cell).length;
          if (len > maxLen) maxLen = Math.min(len, 50);
        });
        colWidths.push({ wch: maxLen + 2 });
      }
      ws['!cols'] = colWidths;

      ws['!freeze'] = { xSplit: 0, ySplit: 3 };

      XLSX.utils.book_append_sheet(wb, ws, 'Certificado');

      const safeId = String(c.equipment_id || c.cc || c.id || 'cert').replace(/[^\w\-]+/g, '_');
      const fileName = `Certificado_${safeId}.xlsx`;
      XLSX.writeFile(wb, fileName);

      this.alert.success(`Certificado exportado como "${fileName}".`, 'Excel generado');

    } catch (err: any) {
      console.error('Error al exportar a Excel:', err);
      this.alert.error('No se pudo generar el archivo Excel.', 'Error de exportación');
    }
  }
}
