import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertService } from '../../../services/core/alert.service';
import { CmcService } from '../../../services/database/cmc.service';
import { CmcData } from '../../../models/cmc.model';
import { Workbook } from 'exceljs';
import { finalize } from 'rxjs/operators';

@Component({
  imports: [FormsModule, CommonModule],
  selector: 'app-viewcmc',
  styleUrl: './viewcmc.css',
  templateUrl: './viewcmc.html',
  standalone: true,
})
export class Viewcmc implements OnInit {

  private readonly alert = inject(AlertService);

  cmc: CmcData | null = null;
  loading = false;
  errorMsg: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cmcService: CmcService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadDetail(id);
    } else {
      this.errorMsg = 'No CMC ID provided.';
      this.alert.error('No se proporcionó un ID de CMC.', 'Error de navegación');
    }
  }

  loadDetail(id: string | number): void {
    this.loading = true;
    this.errorMsg = null;
    this.cmc = null;

    this.cmcService
      .obtenerCmcPorId(id)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (res: any) => {
          const data: CmcData = res.data || res;
          if (!data) {
            this.errorMsg = 'No CMC data received.';
            this.alert.error('No se recibieron datos del CMC.', 'Sin datos');
            return;
          }
          this.cmc = data;
          this.errorMsg = null;
        },
        error: (err) => {
          this.errorMsg = err.error?.message || 'Error loading the CMC.';
          this.alert.error(this.errorMsg ?? 'Error al cargar el CMC.', 'Error');
        }
      });
  }

  goBack(): void {
    this.router.navigate(['/cmc-list']);
  }

  isActive(): boolean {
    return this.cmc?.active === 1 || this.cmc?.active === true;
  }
  get fuentes(): Array<{ nombre: string; valor: number; pesoPct: number }> {
    if (!this.cmc) return [];
    const c = this.cmc;
    const uC = Number(c.u_combined) || 0;
    const uC2 = uC * uC;
    const mk = (nombre: string, valor: any) => {
      const v = Number(valor) || 0;
      const pesoPct = uC2 > 0 ? Math.min(100, (v * v / uC2) * 100) : 0;
      return { nombre, valor: v, pesoPct };
    };
    return [
      mk('Estabilidad', c.stability),
      mk('Sesgo', c.bias),
      mk('Deriva', c.drift),
      mk('Incertidumbre de referencia', c.u_reference),
      mk('Estabilidad de referencia', c.s_reference),
      mk('Repetibilidad', c.repeatability),
      mk('Reproducibilidad', c.reproducibility),
    ];
  }

  async exportToExcel(): Promise<void> {
    if (!this.cmc) {
      this.alert.warning('No hay datos del CMC para exportar.', 'Sin datos');
      return;
    }

    try {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet('CMC');
      const sheetData: any[][] = [];
      const c = this.cmc;

      // ---- RESUMEN GENERAL ----
      sheetData.push(['RESUMEN DEL CMC']);
      sheetData.push([]);

      sheetData.push(['INFORMACIÓN GENERAL']);
      sheetData.push([]);
      const generalFields: Array<[string, any]> = [
        ['ID', c.id ?? ''],
        ['ID del Equipo', c.id_equipment ?? ''],
        ['Usuario', c.id_user ?? ''],
        ['Fecha de Creación', c.created_at ?? ''],
        ['Activo', this.isActive() ? 'Sí' : 'No'],
        ['Certificados Asociados', c.cert_associate ?? ''],
      ];
      generalFields.forEach(([k, v]) => sheetData.push([k, v]));

      // ---- RANGO DE REFERENCIA ----
      sheetData.push([]);
      sheetData.push(['RANGO DE REFERENCIA']);
      sheetData.push([]);
      const rangeFields: Array<[string, any]> = [
        ['Valor de Referencia Mínimo', c.value_ref_min ?? ''],
        ['Valor de Referencia Máximo', c.value_ref_max ?? ''],
        ['Intervalo', c.interval_value ?? ''],
      ];
      rangeFields.forEach(([k, v]) => sheetData.push([k, v]));

      // ---- RESULTADOS DEL CÁLCULO ----
      sheetData.push([]);
      sheetData.push(['RESULTADOS DEL CÁLCULO']);
      sheetData.push([]);
      const calcFields: Array<[string, any]> = [
        ['Incertidumbre Combinada (u_combined)', c.u_combined ?? ''],
        ['Grados de Libertad (degrees_freedom)', c.degrees_freedom ?? ''],
        ['Coeficiente de Expansión (k)', c.coefficient_expansion ?? ''],
        ['Incertidumbre Expandida (U)', c.u_expanded ?? ''],
      ];
      calcFields.forEach(([k, v]) => sheetData.push([k, v]));

      // ---- COMPONENTES DE INCERTIDUMBRE ----
      sheetData.push([]);
      sheetData.push(['COMPONENTES DE INCERTIDUMBRE']);
      sheetData.push([]);
      const componentsFields: Array<[string, any]> = [
        ['Estabilidad', c.stability ?? ''],
        ['Sesgo', c.bias ?? ''],
        ['Deriva', c.drift ?? ''],
        ['Incertidumbre de Referencia', c.u_reference ?? ''],
        ['Estabilidad de Referencia', c.s_reference ?? ''],
        ['Repetibilidad', c.repeatability ?? ''],
        ['Reproducibilidad', c.reproducibility ?? ''],
      ];
      componentsFields.forEach(([k, v]) => sheetData.push([k, v]));

      // Volcar al worksheet
      sheetData.forEach(row => worksheet.addRow(row));

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

      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const safeId = String(c.id_equipment || c.id || 'cmc').replace(/[^\w\-]+/g, '_');
      const fileName = `CMC_${safeId}.xlsx`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);

      this.alert.success(`CMC exportado como "${fileName}".`, 'Excel generado');

    } catch (err: any) {
      console.error('Error al exportar a Excel:', err);
      this.alert.error('No se pudo generar el archivo Excel.', 'Error de exportación');
    }
  }
}
