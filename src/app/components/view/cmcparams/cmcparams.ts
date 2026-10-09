import {
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { CertService } from '../../../services/cert.service';
import { AlertService } from '../../../services/alert.service';
import { ApiResponse, Column, ResultTable } from '../../../models/certificado.models';

@Component({
  selector: 'app-cmcparams',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './cmcparams.html',
  styleUrl: './cmcparams.css',
})
export class Cmcparams implements OnInit {

  equipmentIds: string[] = [];
  selectedEquipmentId = '';

  tablas: ResultTable[] = [];
  filteredTablas: ResultTable[] = [];

  availableTitles: string[] = [];
  availableParameters: string[] = [];

  selectedTitle = '';
  selectedParameter = '';

  cargando = false;

  // Banderas de proceso
  certificadosEnProceso = false;
  certificadosPorCc: Record<string, any> = {};

  private readonly opcionesParametroPorTitulo: Record<string, string[]> = {
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
    'Capacitance': ['Capacitance'],
    'Other': []
  };

  private readonly titulosConocidos = new Set(
    Object.keys(this.opcionesParametroPorTitulo).filter(t => t !== 'Other')
  );

  constructor(
    private readonly cert: CertService,
    private readonly alert: AlertService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarEquipos();
  }


  private cargarEquipos(): void {
    this.cert.obtenerEquipmentId().subscribe({
      next: (response: ApiResponse<string[]>) => {
        if (response.ok) {
          this.equipmentIds = response.data ?? [];
        } else {
          this.alert.error(response.message ?? 'No se pudieron obtener los equipos');
        }
        this.refresh();
      },
      error: (err) => {
        console.error(err);
        this.alert.error('Error de red al obtener los equipos');
        this.refresh();
      }
    });
  }

  // ================================================================
  // CAMBIO DE EQUIPO
  // ================================================================
  onEquipmentChange(): void {
    this.selectedTitle = '';
    this.selectedParameter = '';
    this.tablas = [];
    this.filteredTablas = [];
    this.availableTitles = [];
    this.availableParameters = [];
    this.certificadosPorCc = {};
    this.certificadosEnProceso = false;

    if (!this.selectedEquipmentId) {
      this.refresh();
      return;
    }

    this.cargando = true;
    this.refresh();

    this.cert.obtenerTablas(this.selectedEquipmentId)
      .pipe(
        finalize(() => {
          this.cargando = false;
          this.refresh();
        })
      )
      .subscribe({
        next: (response: ApiResponse<ResultTable[]>) => {
          if (response.ok && response.data?.length) {
            this.tablas = response.data;
            this.filteredTablas = [...this.tablas];
            this.construirTitulos();

            this.alert.success(
              `Se cargaron ${this.tablas.length} tabla${this.tablas.length === 1 ? '' : 's'} del equipo ${this.selectedEquipmentId}.`,
              'Tablas cargadas'
            );
          } else {
            this.alert.info(
              response.message ?? `El equipo ${this.selectedEquipmentId} no tiene tablas asociadas.`,
              'Sin datos'
            );
          }
        },
        error: (err) => {
          console.error(err);
          this.alert.error(
            err?.error?.message ?? 'Error al obtener las tablas del equipo',
            'Error de conexión'
          );
        }
      });
  }


  private construirTitulos(): void {
    const titulosPresentes = new Set(this.tablas.map(t => t.title));

    const conocidos = Array.from(titulosPresentes)
      .filter(t => this.titulosConocidos.has(t))
      .sort();

    const hayDesconocidos = Array.from(titulosPresentes)
      .some(t => !this.titulosConocidos.has(t));

    this.availableTitles = hayDesconocidos ? [...conocidos, 'Other'] : conocidos;
  }

  private calcularParametros(titulo: string): string[] {
    if (!titulo) return [];

    if (titulo === 'Other') {
      const params = new Set<string>();
      this.tablas
        .filter(t => !this.titulosConocidos.has(t.title))
        .forEach(t => params.add(t.parameter));
      return Array.from(params).sort();
    }

    const esperados = this.opcionesParametroPorTitulo[titulo] ?? [];
    const presentes = new Set(
      this.tablas.filter(t => t.title === titulo).map(t => t.parameter)
    );

    const coincidentes = esperados.filter(p => presentes.has(p));
    const extras = Array.from(presentes).filter(p => !esperados.includes(p));

    return extras.length ? [...coincidentes, 'Other'] : coincidentes;
  }

  onTitleChange(): void {
    this.selectedParameter = '';
    this.availableParameters = this.calcularParametros(this.selectedTitle);
    this.aplicarFiltros();
  }

  onParameterChange(): void {
    this.aplicarFiltros();
  }

  // ================================================================
  // FILTROS
  // ================================================================
  private aplicarFiltros(): void {
    this.filteredTablas = this.tablas.filter(t => {
      if (this.selectedTitle === 'Other') {
        if (this.titulosConocidos.has(t.title)) return false;
      } else if (this.selectedTitle) {
        if (t.title !== this.selectedTitle) return false;
      }

      if (this.selectedParameter === 'Other') {
        if (this.selectedTitle !== 'Other') {
          const esperados = this.opcionesParametroPorTitulo[this.selectedTitle] ?? [];
          if (esperados.includes(t.parameter)) return false;
        }
      } else if (this.selectedParameter) {
        if (t.parameter !== this.selectedParameter) return false;
      }

      return true;
    });

    if (this.selectedTitle) {
      this.cargarCertificadosDeTablas();
    } else {
      this.certificadosEnProceso = false;
      this.certificadosPorCc = {};
      this.refresh();
    }
  }


  private cargarCertificadosDeTablas(): void {
    if (!this.selectedTitle) return;

    const ccs = Array.from(
      new Set(
        this.filteredTablas
          .map(t => t.cc_id)
          .filter((cc): cc is string => !!cc)
      )
    );

    const pendientes = ccs.filter(cc => !(cc in this.certificadosPorCc));

    if (!pendientes.length) {
      this.certificadosEnProceso = false;
      this.refresh();
      return;
    }

    this.certificadosEnProceso = true;
    this.refresh();

    const peticiones$ = pendientes.map(cc =>
      this.cert.obtenerCertificadoCc(cc).pipe(
        catchError(err => {
          console.error(`Error al obtener certificado ${cc}`, err);
          this.alert.error(`Error de red al obtener el certificado ${cc}`);
          return of({ ok: false, data: null });
        })
      )
    );

    forkJoin(peticiones$)
      .pipe(
        finalize(() => {
          this.certificadosEnProceso = false;
          this.refresh();
        })
      )
      .subscribe({
        next: (respuestas) => {
          const nuevosCertificados = { ...this.certificadosPorCc };

          respuestas.forEach((response, index) => {
            const cc = pendientes[index];
            nuevosCertificados[cc] = (response && response.ok && response.data) ? response.data : null;
          });

          this.certificadosPorCc = nuevosCertificados;

          const total = pendientes.length;
          this.alert.success(
            `Se cargaron ${total} certificado${total === 1 ? '' : 's'} asociado${total === 1 ? '' : 's'}.`,
            'Certificados cargados'
          );
        }
      });
  }

  /** Helper para el template */
  getCertificado(tabla: ResultTable): any {
    const cc = tabla?.cc_id;
    if (!cc) return null;
    return this.certificadosPorCc[cc] ?? null;
  }

  getCellValue(row: Record<string, any>, col: Column): string {
    const v = row?.[col.key];
    if (v === null || v === undefined || v === '') return '—';
    return String(v);
  }

  resetFiltros(): void {
    this.selectedTitle = '';
    this.selectedParameter = '';
    this.availableParameters = [];
    this.filteredTablas = [...this.tablas];
    this.certificadosPorCc = {};
    this.certificadosEnProceso = false;
    this.refresh();
    this.alert.info('Filtros restablecidos.', 'Sin filtros');
  }


  private refresh(): void {
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }
}
