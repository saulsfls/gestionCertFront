import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CertService } from '../../../services/cert.service';
import { Certificado, ApiResponse } from '../../../models/certificado.models';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-admincert',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './admincert.html',
  styleUrl: './admincert.css',
})
export class admincert implements OnInit {

  private readonly alert = inject(AlertService);

  // Contraseña de protección (cambiar según necesidad)
  private readonly PASSWORD = 'admin';

  // Lista de certificados
  listaCertificados: Certificado[] = [];

  // Estado de carga
  cargando = false;

  // Filtros de búsqueda
  textoBusqueda = '';
  filtroEstado: 'todos' | 'activos' | 'inactivos' = 'todos';

  // Bandera para evitar doble eliminación
  private eliminando: Set<string | number> = new Set();

  constructor(
    private certService: CertService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.verificarPassword();
  }

  // Solicita la contraseña al usuario; si es correcta carga los certificados
  async verificarPassword(): Promise<void> {
    const pass = await this.alert.prompt(
      'Ingrese la contraseña para acceder a la administración de certificados.',
      'Acceso restringido',
      {
        type: 'question',
        confirmText: 'Acceder',
        cancelText: 'Cancelar',
        dismissible: false,
        prompt: {
          placeholder: 'Contraseña…',
          defaultValue: '',
          inputType: 'password',   // 👈 Aquí
        },
      }
    );

    if (pass === null) {
      this.alert.info('Acceso cancelado.', 'Saliendo');
      this.router.navigate(['/listcert']);
      return;
    }

    if (pass === this.PASSWORD) {
      this.alert.success('Acceso concedido.', 'Bienvenido');
      this.obtenerCertificados();
    } else {
      this.alert.error('Contraseña incorrecta. Acceso denegado.', 'Acceso denegado');
      this.router.navigate(['/listcert']);
    }
  }

  // Obtiene todos los certificados desde el servicio
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

  // Getter que filtra la lista según búsqueda y estado
  get certificadosFiltrados(): Certificado[] {
    return this.listaCertificados.filter((cert) => {
      if (this.filtroEstado === 'activos' && !cert.active) return false;
      if (this.filtroEstado === 'inactivos' && cert.active) return false;

      if (!this.textoBusqueda.trim()) return true;

      const termino = this.textoBusqueda.toLowerCase().trim();
      const matchEquipmentId = cert.equipment_id?.toLowerCase().includes(termino) || false;
      const matchId = cert.id ? String(cert.id).toLowerCase().includes(termino) : false;
      const matchCc = cert.cc?.toLowerCase().includes(termino) || false;
      const matchName = cert.name_equipment?.toLowerCase().includes(termino) || false;

      return matchEquipmentId || matchId || matchCc || matchName;
    });
  }

  // Elimina un certificado por su ID con confirmación previa del usuario
  async eliminarCertificado(id: number | string | undefined): Promise<void> {
    if (!id) {
      this.alert.warning('ID de certificado no válido.', 'Sin ID');
      return;
    }

    if (this.eliminando.has(id)) return;

    const cert = this.listaCertificados.find(c => c.id === id);
    const identificador = cert ? (cert.cc || cert.equipment_id || id) : id;

    const confirmado = await this.alert.confirm(
      `Se eliminará permanentemente el certificado "${identificador}". Esta acción no se puede deshacer.`,
      'Eliminar certificado',
      {
        type: 'error',
        confirmText: 'Sí, eliminar',
        cancelText: 'Cancelar',
        dismissible: false,
      }
    );

    if (!confirmado) {
      this.alert.info('Eliminación cancelada.', 'Sin cambios');
      return;
    }

    this.eliminando.add(id);
    this.cargando = true;
    this.cdr.detectChanges();

    this.certService.eliminarCertificado(id).subscribe({
      next: () => {
        this.listaCertificados = this.listaCertificados.filter(c => c.id !== id);
        this.eliminando.delete(id);
        this.cargando = false;
        this.cdr.detectChanges();

        this.alert.success(
          `Certificado "${identificador}" eliminado correctamente.`,
          'Eliminado'
        );
      },
      error: (err: any) => {
        console.error('Error al eliminar certificado:', err);
        this.eliminando.delete(id);
        this.cargando = false;
        this.cdr.detectChanges();

        const msg = err.error?.message || 'No se pudo eliminar el certificado.';
        this.alert.error(msg, 'Error al eliminar');
      },
    });
  }

  // Navega de vuelta a la vista principal de certificados
  volver(): void {
    this.router.navigate(['/listcert']);
  }
}
