import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ApiResponse, Certificado, CertificadoData, ResultTable } from '../../../models/certificado.models';
import { Router } from '@angular/router';
import { CertService } from '../../../services/cert.service';
import { FiltroEstado } from '../viewcert/viewcert';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-listcert',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './listcert.html',
  styleUrl: './listcert.css',
})
export class Listcert implements OnInit {

  private readonly alert = inject(AlertService);

  // Lista principal de certificados
  listaCertificados: Certificado[] = [];

  // Estado de la vista
  cargando = false;

  // Filtros de búsqueda
  textoBusqueda = '';
  filtroEstado: FiltroEstado = 'todos';

  // Control de expansión de fila para mostrar resumen rápido
  idExpandido: number | string | null = null;

  // Certificado seleccionado para expandir
  certificadoSeleccionado: Certificado | null = null;

  // Modal de edición rápida
  certificadoEdicion: Certificado | null = null;
  jsonEdicionTexto = '';

  // Bandera para evitar doble desactivación
  private desactivando: Set<string | number> = new Set();

  constructor(
    private certService: CertService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.obtenerCertificados();
  }

  // Navega hacia el componente de edición pasando el ID del certificado
  editarCertificado(id: number | string | undefined): void {
    if (!id) return;
    this.router.navigate(['/editcert', id]);
  }

  administrarCertificado(): void {
    this.router.navigate(['/admincert']);
  }

  detalleCertificado(id: number | string | undefined): void {
    if (!id) return;
    this.router.navigate(['/viewcert', id]);
  }

  // Getter reactivo que filtra por equipo, ID, folio (cc) o nombre, además del estado
  get certificadosFiltrados(): Certificado[] {
    return this.listaCertificados.filter((cert) => {
      if (this.filtroEstado === 'activos' && !cert.active) return false;
      if (this.filtroEstado === 'inactivos' && cert.active) return false;

      if (!this.textoBusqueda.trim()) return true;

      const termino = this.textoBusqueda.toLowerCase().trim();
      const matchEquipmentId = cert.equipment_id
        ? cert.equipment_id.toLowerCase().includes(termino)
        : false;
      const matchId = cert.id ? String(cert.id).toLowerCase().includes(termino) : false;
      const matchCc = cert.cc ? cert.cc.toLowerCase().includes(termino) : false;
      const matchName = cert.name_equipment
        ? cert.name_equipment.toLowerCase().includes(termino)
        : false;

      return matchEquipmentId || matchId || matchCc || matchName;
    });
  }

  // Obtiene todos los certificados a través del servicio
  obtenerCertificados(): void {
    this.cargando = true;
    this.cdr.detectChanges();

    this.certService.obtenerCertificados().subscribe({
      next: (res: ApiResponse<Certificado[]>) => {
        if (res && res.ok && Array.isArray(res.data)) {
          this.listaCertificados = res.data;
        } else if (Array.isArray(res)) {
          this.listaCertificados = res as unknown as Certificado[];
        } else {
          this.listaCertificados = [];
        }

        this.cargando = false;
        this.cdr.detectChanges();

        if (this.listaCertificados.length > 0) {
          this.alert.success(
            `Se cargaron ${this.listaCertificados.length} certificado${this.listaCertificados.length === 1 ? '' : 's'}.`,
            'Lista actualizada'
          );
        } else {
          this.alert.info('No hay certificados registrados todavía.', 'Sin datos');
        }
      },
      error: (err: any) => {
        console.error('Error al obtener certificados:', err);
        this.cargando = false;
        this.cdr.detectChanges();

        const msg = err.error?.message || 'Error al conectar con la base de datos.';
        this.alert.error(msg, 'Error al cargar certificados');
      },
    });
  }

  // Desplegar u ocultar la sección inferior con un resumen rápido del certificado
  toggleDetalle(id: number | string | undefined, cert: Certificado): void {
    if (!id) return;
    if (this.idExpandido === id) {
      this.idExpandido = null;
      this.certificadoSeleccionado = null;
    } else {
      this.idExpandido = id;
      this.certificadoSeleccionado = cert;
    }
  }

  // Procesa la columna 'data' (JSONB) para extraer 'Result Tables'
  obtenerTablasResultado(
    data?: CertificadoData | Record<string, any>,
    certEquipmentId?: string
  ): ResultTable[] {
    if (!data) return [];

    const certData = data as CertificadoData;
    let tablas = certData['Result Tables'] || [];

    if (certEquipmentId) {
      tablas = tablas.map((tabla: any) => ({
        ...tabla,
        equipment_id: tabla.equipment_id || certEquipmentId,
        comments: tabla.comments || '',
        title: tabla.title || tabla.titulo || '',
        parameter: tabla.parameter || tabla.mesurando || '',
        calibration_equation: tabla.calibration_equation || tabla.ecuation_calibration || '',
        columns: tabla.columns || tabla.columnas || [],
        rows: tabla.rows || tabla.filas || [],
      }));
    }

    return tablas;
  }

  // Obtiene el equipment_id de una tabla o, en su defecto, el del certificado seleccionado
  obtenerEquipmentIdDeTabla(tabla: ResultTable): string {
    return tabla.equipment_id || this.certificadoSeleccionado?.equipment_id || '';
  }

  // Desactiva el certificado seleccionado previa confirmación del usuario
  async desactivarCertificado(cert: Certificado): Promise<void> {
    if (!cert.active || !cert.id) return;

    if (this.desactivando.has(cert.id)) return;

    const identificador = cert.cc || cert.equipment_id || cert.id;

    const confirmado = await this.alert.confirm(
      `El certificado "${identificador}" se marcará como inactivo. ¿Deseas continuar?`,
      'Confirmar desactivación',
      {
        type: 'warning',
        confirmText: 'Sí, desactivar',
        cancelText: 'Cancelar',
        dismissible: false,
      }
    );

    if (!confirmado) {
      this.alert.info('Desactivación cancelada.', 'Sin cambios');
      return;
    }

    this.desactivando.add(cert.id);

    const estadoAnterior = cert.active;
    cert.active = false;
    this.cdr.detectChanges();

    this.certService.desactivarCertificado(cert.id).subscribe({
      next: () => {
        this.desactivando.delete(cert.id!);
        this.cdr.detectChanges();

        this.alert.success(
          `El certificado "${identificador}" ha sido desactivado con éxito.`,
          'Desactivado'
        );
      },
      error: (err: any) => {
        cert.active = estadoAnterior;
        this.desactivando.delete(cert.id!);
        this.cdr.detectChanges();

        const msg = err.error?.message
          || 'No se pudo desactivar el certificado en la base de datos.';
        this.alert.error(msg, 'Error al desactivar');
      },
    });
  }

  // Helpers de formateo y edición modal
  obtenerJsonString(data: any): string {
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  abrirModalEdicion(cert: Certificado): void {
    this.certificadoEdicion = { ...cert };
    this.jsonEdicionTexto = cert.data ? JSON.stringify(cert.data, null, 2) : '{}';
  }

  cerrarModalEdicion(): void {
    this.certificadoEdicion = null;
    this.jsonEdicionTexto = '';
  }

  // Copia el JSON del modal al portapapeles
  copiarJson(): void {
    if (!this.jsonEdicionTexto) return;
    navigator.clipboard.writeText(this.jsonEdicionTexto).then(() => {
      this.alert.success('JSON copiado al portapapeles.');
    });
  }
}
