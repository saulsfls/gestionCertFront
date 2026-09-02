import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CertService } from '../../services/cert.service';
import { Certificado, ApiResponse } from '../../models/certificado.models';

@Component({
  selector: 'app-admincert',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './admincert.html',
  styleUrl: './admincert.css',
})
export class admincert implements OnInit {
  // Contraseña de protección (cambiar según necesidad)
  private readonly PASSWORD = 'admin';

  // Lista de certificados
  listaCertificados: Certificado[] = [];

  // Estados de carga y mensajes
  cargando: boolean = false;
  mensajeError: string | null = null;
  mensajeExito: string | null = null;

  // Filtros de búsqueda (opcional)
  textoBusqueda: string = '';
  filtroEstado: 'todos' | 'activos' | 'inactivos' = 'todos';

  constructor(
    private certService: CertService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Verificar contraseña antes de cargar cualquier dato
    this.verificarPassword();
  }

  /**
   * Solicita la contraseña al usuario mediante prompt.
   * Si es correcta, carga los certificados.
   * Si es incorrecta, redirige a la lista de certificados.
   */
  verificarPassword(): void {
    const pass = prompt('🔒 Ingrese la contraseña para acceder a la administración de eliminación:');
    if (pass === this.PASSWORD) {
      // Contraseña correcta, cargar certificados
      this.obtenerCertificados();
    } else {
      // Contraseña incorrecta o cancelada
      alert('Contraseña incorrecta. Acceso denegado.');
      this.router.navigate(['/viewcert']);
    }
  }

  /**
   * Obtiene todos los certificados desde el servicio.
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
   * Getter para filtrar la lista según búsqueda y estado.
   */
  get certificadosFiltrados(): Certificado[] {
    return this.listaCertificados.filter((cert) => {
      // Filtro por estado
      if (this.filtroEstado === 'activos' && !cert.active) return false;
      if (this.filtroEstado === 'inactivos' && cert.active) return false;

      // Filtro por texto de búsqueda
      if (!this.textoBusqueda.trim()) return true;

      const termino = this.textoBusqueda.toLowerCase().trim();
      const matchEquipmentId = cert.equipment_id?.toLowerCase().includes(termino) || false;
      const matchId = cert.id ? String(cert.id).toLowerCase().includes(termino) : false;
      const matchCc = cert.cc?.toLowerCase().includes(termino) || false;
      const matchName = cert.name_equipment?.toLowerCase().includes(termino) || false;

      return matchEquipmentId || matchId || matchCc || matchName;
    });
  }

  /**
   * Elimina un certificado por su ID con confirmación del usuario.
   */
  eliminarCertificado(id: number | string | undefined): void {
    if (!id) {
      this.mensajeError = 'ID de certificado no válido.';
      return;
    }

    // Buscar el certificado para mostrar información en la confirmación
    const cert = this.listaCertificados.find(c => c.id === id);
    const identificador = cert ? (cert.cc || cert.equipment_id || id) : id;

    const confirmado = window.confirm(
      `¿Estás seguro de que deseas eliminar el certificado "${identificador}"?\nEsta acción no se puede deshacer.`
    );
    if (!confirmado) return;

    this.cargando = true;
    this.certService.eliminarCertificado(id).subscribe({
      next: () => {
        this.mensajeExito = `Certificado "${identificador}" eliminado correctamente.`;
        // Eliminar de la lista local para actualizar la vista
        this.listaCertificados = this.listaCertificados.filter(c => c.id !== id);
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error al eliminar certificado:', err);
        this.mensajeError = err.error?.message || 'No se pudo eliminar el certificado.';
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Navega de vuelta a la vista principal de certificados.
   */
  volver(): void {
    this.router.navigate(['/viewcert']);
  }
}
