import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CertService } from '../../services/cert.service';
import {
  Certificado,
  CertificadoData,
  TablaResultado,
  ApiResponse,
} from '../../models/certificado.models';

export type FiltroEstado = 'todos' | 'activos' | 'inactivos';

@Component({
  selector: 'app-viewcert',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './viewcert.html',
  styleUrl: './viewcert.css',
})
export class Viewcert implements OnInit {
  // Lista principal de certificados
  listaCertificados: Certificado[] = [];

  // Estado de la vista
  cargando: boolean = false;
  mensajeError: string | null = null;
  mensajeExito: string | null = null;

  // Filtros de Búsqueda
  textoBusqueda: string = '';
  filtroEstado: FiltroEstado = 'todos';

  // Control de expansión de fila para mostrar tablas/JSON
  idExpandido: number | string | null = null;

  // Certificado seleccionado para expandir
  certificadoSeleccionado: Certificado | null = null;

  // Modal de edición rápida
  certificadoEdicion: Certificado | null = null;
  jsonEdicionTexto: string = '';

  constructor(
    private certService: CertService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.obtenerCertificados();
  }

  /**
   * Navega hacia el componente de edición pasando el ID del certificado como parámetro de ruta.
   */
  editarCertificado(id: number | string | undefined): void {
    if (!id) return;
    this.router.navigate(['/editcert', id]);
  }
  //Navega hacia el componente de administración de certificados
  administrarCertificado(){
    this.router.navigate(['/admincert']);
  }

  /**
   * Getter reactivo que filtra por equipo, ID, folio (cc) o nombre,
   * además del estado Activo / Inactivo.
   */
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

  /**
   * Obtener todos los certificados a través del servicio
   */
  obtenerCertificados(): void {
    this.cargando = true;
    this.mensajeError = null;
    this.mensajeExito = null;

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
      },
      error: (err: any) => {
        console.error('Error al obtener certificados:', err);
        this.mensajeError = err.error?.message || 'Error al conectar con la base de datos.';
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Desplegar / Ocultar la sección inferior con las tablas dinámicas
   * y almacena el certificado seleccionado.
   */
  toggleDetalle(id: number | string | undefined, cert: Certificado): void {
    if (!id) return;
    if (this.idExpandido === id) {
      this.idExpandido = null;
      this.certificadoSeleccionado = null;
    } else {
      this.idExpandido = id;
      this.certificadoSeleccionado = cert;
      // Asegurar que las tablas tengan equipment_id (se hace en obtenerTablasResultado)
    }
    this.cdr.detectChanges();
  }

  /**
   * Procesa la columna 'data' (JSONB) para extraer 'Tablas de resultados'
   * y asigna el equipment_id del certificado a cada tabla si no lo tienen.
   */
  obtenerTablasResultado(
    data?: CertificadoData | Record<string, any>,
    certEquipmentId?: string
  ): TablaResultado[] {
    if (!data) return [];

    const certData = data as CertificadoData;
    let tablas = certData['Tablas de resultados'] || certData.tablas_resultados || [];

    // Si se proporciona un equipment_id del certificado, asignarlo a cada tabla si falta
    if (certEquipmentId) {
      tablas = tablas.map((tabla: any) => ({
        ...tabla,
        equipment_id: tabla.equipment_id || tabla.id_equipment || certEquipmentId,
      }));
    }

    return tablas;
  }

  /**
   * Obtiene el equipment_id de una tabla o, en su defecto, el del certificado seleccionado.
   * Útil para mostrar en la vista cuando se itera sobre las tablas.
   */
  obtenerEquipmentIdDeTabla(tabla: TablaResultado): string {
    return tabla.equipment_id || this.certificadoSeleccionado?.equipment_id || '';
  }

  /**
   * Desactiva el certificado seleccionado
   */
  desactivarCertificado(cert: Certificado): void {
    if (!cert.active || !cert.id) return;

    const identificador = cert.cc || cert.equipment_id;
    const confirmado = window.confirm(`¿Deseas desactivar el certificado ${identificador}?`);
    if (!confirmado) return;

    cert.active = false;

    this.certService.desactivarCertificado(cert.id).subscribe({
      next: () => {
        this.mensajeExito = `El certificado ${identificador} ha sido desactivado con éxito.`;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        cert.active = true;
        this.mensajeError = err.error?.message || 'No se pudo desactivar el certificado en la base de datos.';
        this.cdr.detectChanges();
      },
    });
  }

  // --- Helpers de Formateo y Edición Modal ---
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
}
