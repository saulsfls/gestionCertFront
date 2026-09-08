import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CertService } from '../../services/cert.service';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import {
  Certificado,
  ResultTable,
} from '../../models/certificado.models';
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
            return;
          }
          this.certificado = data;

          // Look for "Result Tables" (English) or fallback to "Tablas de resultados"
          const tablesData = data.data?.['Result Tables'] ||[];
          if (tablesData && Array.isArray(tablesData)) {
            this.resultTables = tablesData.map((t: any) => ({
              title: t.title || '',
              equipment_id: t.equipment_id || this.certificado?.equipment_id || '',
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
        }
      });
  }

  goBack(): void {
    this.router.navigate(['/listcert']);
  }

  exportToExcel(): void {
    if (!this.certificado) {
      alert('No certificate data to export.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Build a single sheet with all content
    const sheetData: any[][] = [];

    // --- Section: Certificate Summary ---
    sheetData.push(['CERTIFICATE SUMMARY']);
    sheetData.push([]); // blank row

    // Certificate data as key-value pairs
    const summaryFields = [
      ['ID', this.certificado.id || ''],
      ['Equipment ID', this.certificado.equipment_id || ''],
      ['Equipment Name', this.certificado.name_equipment || ''],
      ['Folio / CC', this.certificado.cc || ''],
      ['Calibration Date', this.certificado.date_cal || ''],
      ['Certificate Date', this.certificado.date_cc || ''],
      ['Issuing Entity', this.certificado.entity || ''],
      ['Certificate Type', this.certificado.cert_type || ''],
      ['Comments', this.certificado.comments || ''],
      ['Active', this.certificado.active ? 'Yes' : 'No']
    ];

    summaryFields.forEach(([key, value]) => {
      sheetData.push([key, value]);
    });

    // If there are result tables, add them
    if (this.resultTables.length > 0) {
      sheetData.push([]); // blank row
      sheetData.push(['RESULT TABLES']);
      sheetData.push([]); // blank row

      this.resultTables.forEach((table, idx) => {
        // Table title
        const title = table.title || `Table ${idx + 1}`;
        sheetData.push([`${title}`]);
        sheetData.push([]); // blank row

        // Metadata as key-value pairs
        const metadata = [
          ['Parameter', table.parameter || ''],
          ['Unit', table.unit || ''],
          ['Range', table.range || ''],
          ['Calibration Equation', table.calibration_equation || ''],
          ['Comments', table.comments || '']
        ];
        metadata.forEach(([key, value]) => {
          sheetData.push([key, value]);
        });

        sheetData.push([]); // blank row before column headers

        // Column headers
        const headers = table.columns.map(col => col.label + (col.unit ? ` (${col.unit})` : ''));
        sheetData.push(headers);

        // Data rows
        if (table.rows.length > 0) {
          table.rows.forEach(row => {
            const rowData = table.columns.map(col => {
              const val = row[col.key];
              return val !== undefined && val !== null ? val : '';
            });
            sheetData.push(rowData);
          });
        } else {
          sheetData.push(['No records']);
        }

        // Blank row between tables (except after the last one)
        if (idx < this.resultTables.length - 1) {
          sheetData.push([]);
          sheetData.push([]); // double space for separation
        }
      });
    } else {
      sheetData.push([]);
      sheetData.push(['No result tables associated.']);
    }

    // Create worksheet from the rows
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Adjust column widths (optional)
    const maxCols = Math.max(...sheetData.map(row => row.length), 0);
    const colWidths = Array(maxCols).fill({ wch: 25 });
    ws['!cols'] = colWidths;

    // Append the sheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Certificate');

    // Save file
    const fileName = `Certificate_${this.certificado.equipment_id || 'detail'}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }
}
