import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CertService } from '../../services/cert.service';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import {
  Certificado,
  TablaResultado,
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
  tablas: TablaResultado[] = [];
  cargando = false;
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
      this.cargarDetalle(id);
    } else {
      this.errorMsg = 'No se proporcionó ID de certificado.';
    }
  }

  cargarDetalle(id: string | number): void {
    this.cargando = true;
    this.errorMsg = null;
    this.certificado = null;
    this.tablas = [];

    this.certService
      .obtenerCertificadoPorId(id)
      .pipe(
        finalize(() => {
          this.cargando = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (res: any) => {
          const data: Certificado = res.data || res;
          if (!data) {
            this.errorMsg = 'No se recibieron datos del certificado.';
            return;
          }
          this.certificado = data;

          if (data.data && data.data['Tablas de resultados']) {
            this.tablas = data.data['Tablas de resultados'].map((t: any) => ({
              ...t,
              comentarios: t.comentarios || '',
              coments: t.coments || t.comentarios || '',
            }));
          } else {
            this.tablas = [];
          }
          this.errorMsg = null;
        },
        error: (err) => {
          this.errorMsg = err.error?.message || 'Error al cargar el certificado.';
        }
      });
  }

  volver(): void {
    this.router.navigate(['/listcert']);
  }

  exportarExcel(): void {
    if (!this.certificado) {
      alert('No hay datos del certificado para exportar.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Construir la hoja única con todo el contenido
    const hojaData: any[][] = [];

    // --- Sección: Resumen del Certificado ---
    hojaData.push(['RESUMEN DEL CERTIFICADO']);
    hojaData.push([]); // fila en blanco

    // Datos del certificado en pares clave-valor
    const resumenCampos = [
      ['ID', this.certificado.id || ''],
      ['Equipment ID', this.certificado.equipment_id || ''],
      ['Nombre Equipo', this.certificado.name_equipment || ''],
      ['Folio/CC', this.certificado.cc || ''],
      ['Fecha Calibración', this.certificado.date_cal || ''],
      ['Fecha Certificado', this.certificado.date_cc || ''],
      ['Entidad', this.certificado.entity || ''],
      ['Tipo', this.certificado.cert_type || ''],
      ['Comentarios', this.certificado.comments || ''],
      ['Activo', this.certificado.active ? 'Sí' : 'No']
    ];

    resumenCampos.forEach(([clave, valor]) => {
      hojaData.push([clave, valor]);
    });

    // Si hay tablas, agregamos separación y las tablas
    if (this.tablas.length > 0) {
      hojaData.push([]); // fila en blanco
      hojaData.push(['TABLAS DE RESULTADOS']);
      hojaData.push([]); // fila en blanco

      this.tablas.forEach((tabla, idx) => {
        // Título de la tabla
        const titulo = tabla.titulo || `Tabla ${idx + 1}`;
        hojaData.push([`${titulo}`]);
        hojaData.push([]); // fila en blanco

        // Metadatos en pares clave-valor
        const metadatos = [
          ['Mesurando', tabla.mesurando || ''],
          ['Unidad', tabla.unit || ''],
          ['Rango', tabla.range || ''],
          ['Ecuación', tabla.ecuation_calibration || ''],
          ['Comentarios', tabla.coments || '']
        ];
        metadatos.forEach(([clave, valor]) => {
          hojaData.push([clave, valor]);
        });

        hojaData.push([]); // fila en blanco antes de encabezados

        // Encabezados de columnas
        const encabezados = tabla.columnas.map(col => col.label + (col.unit ? ` (${col.unit})` : ''));
        hojaData.push(encabezados);

        // Filas de datos
        if (tabla.filas.length > 0) {
          tabla.filas.forEach(fila => {
            const filaData = tabla.columnas.map(col => {
              const val = fila[col.key];
              return val !== undefined && val !== null ? val : '';
            });
            hojaData.push(filaData);
          });
        } else {
          hojaData.push(['Sin registros']);
        }

        // Fila en blanco entre tablas (excepto después de la última)
        if (idx < this.tablas.length - 1) {
          hojaData.push([]);
          hojaData.push([]); // doble espacio para separar
        }
      });
    } else {
      hojaData.push([]);
      hojaData.push(['No hay tablas de resultados asociadas.']);
    }

    // Crear la hoja a partir de las filas
    const ws = XLSX.utils.aoa_to_sheet(hojaData);

    // Ajustar el ancho de las columnas (opcional)
    const maxCols = Math.max(...hojaData.map(row => row.length), 0);
    const colWidths = Array(maxCols).fill({ wch: 25 });
    ws['!cols'] = colWidths;

    // Agregar la hoja al libro
    XLSX.utils.book_append_sheet(wb, ws, 'Certificado');

    // Guardar archivo
    const nombreArchivo = `Certificado_${this.certificado.equipment_id || 'detalle'}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  }
}
