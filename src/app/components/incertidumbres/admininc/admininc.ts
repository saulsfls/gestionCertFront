import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertService } from '../../../services/core/alert.service';
import {
  Uncertainty,
  CreateUncertaintyDto,
  UncertaintyType,
  UncertaintyDistribution,
  ApiErrorResponse
} from '../../../models/incertidumbre.model';
import { IncertidumbreService } from '../../../services/database/home/incertidumbre.service';
// Importamos los tipos para el formulario
import { AlertFormValues, AlertFormField } from '../../../components/core/alert/alert.model';

@Component({
  selector: 'app-admininc',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './admininc.html',
  styleUrl: './admininc.css',
})
export class admininc implements OnInit {

  private readonly alert = inject(AlertService);
  private readonly PASSWORD = 'admin';

  listaInc: Uncertainty[] = [];
  cargando = false;
  textoBusqueda = '';
  filtroEstado: 'todos' | 'activos' | 'obsoletos' = 'todos';

  private eliminando: Set<number> = new Set();
  idExpandido: number | null = null;

  readonly TIPOS: UncertaintyType[] = ['TIPO A', 'TIPO B'];
  readonly DISTRIBUCIONES: UncertaintyDistribution[] = [
    'NORMAL', 'RECTANGULAR', 'TRIANGULAR', 'U', 'OTRA'
  ];

  constructor(
    private incService: IncertidumbreService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.verificarPassword();
  }

  // Seguridad: contraseña de acceso
  async verificarPassword(): Promise<void> {
    const pass = await this.alert.prompt(
      'Ingrese la contraseña para acceder a la administración de incertidumbres.',
      'Acceso restringido',
      {
        type: 'question',
        confirmText: 'Acceder',
        cancelText: 'Cancelar',
        dismissible: false,
        prompt: {
          placeholder: 'Contraseña…',
          defaultValue: '',
          inputType: 'password'
        }
      }
    );

    if (pass === null) {
      this.alert.info('Acceso cancelado.', 'Saliendo');
      this.router.navigate(['/list-cert']);
      return;
    }

    if (pass === this.PASSWORD) {
      this.alert.success('Acceso concedido.', 'Bienvenido');
      this.obtenerInc();
    } else {
      this.alert.error('Contraseña incorrecta. Acceso denegado.', 'Acceso denegado');
      this.router.navigate(['/list-cert']);
    }
  }

  // Carga de datos
  obtenerInc(): void {
    this.cargando = true;
    this.cdr.detectChanges();

    this.incService.listar(true).subscribe({
      next: (res) => {
        this.listaInc = Array.isArray(res?.data) ? res.data : [];
        this.cargando = false;
        this.cdr.detectChanges();

        if (this.listaInc.length > 0) {
          this.alert.success(
            `Se cargaron ${this.listaInc.length} incertidumbres.`,
            'Lista actualizada'
          );
        } else {
          this.alert.info('No hay incertidumbres registradas todavía.', 'Sin datos');
        }
      },
      error: (err: ApiErrorResponse) => {
        console.error('Error al obtener incertidumbres:', err);
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.error(
          err?.message || 'Error al conectar con la base de datos.',
          'Error'
        );
      }
    });
  }

  // Panel de opciones (toggle)
  toggleDetalle(id: number | undefined): void {
    if (id === undefined) return;
    this.idExpandido = this.idExpandido === id ? null : id;
  }

  // Helpers de estado
  esObsoleto(u: Uncertainty): boolean {
    return Number(u.obsolete) === 1;
  }

  get incFiltradas(): Uncertainty[] {
    return this.listaInc.filter((u) => {
      const isObsoleto = this.esObsoleto(u);
      if (this.filtroEstado === 'activos' && isObsoleto) return false;
      if (this.filtroEstado === 'obsoletos' && !isObsoleto) return false;

      if (!this.textoBusqueda.trim()) return true;

      const t = this.textoBusqueda.toLowerCase().trim();
      return (
        (u.clave?.toLowerCase().includes(t)) ||
        (u.name?.toLowerCase().includes(t)) ||
        (u.description?.toLowerCase().includes(t)) ||
        (u.type?.toLowerCase().includes(t)) ||
        (u.distribution?.toLowerCase().includes(t)) ||
        (u.id ? String(u.id).toLowerCase().includes(t) : false)
      );
    });
  }

  contarActivos(): number {
    return this.incFiltradas.filter(u => !this.esObsoleto(u)).length;
  }

  contarObsoletos(): number {
    return this.incFiltradas.filter(u => this.esObsoleto(u)).length;
  }

  trackByIncId(index: number, u: Uncertainty): number {
    return u.id ?? index;
  }

  // CREAR (formulario vía AlertService)
  async crearIncertidumbre(): Promise<void> {
    const dto = await this.formularioIncertidumbre();
    if (!dto) return;

    this.cargando = true;
    this.cdr.detectChanges();

    this.incService.crear(dto).subscribe({
      next: (res) => {
        if (res?.data) {
          this.listaInc = [...this.listaInc, res.data];
        }
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.success(
          `Incertidumbre "${dto.clave}" creada correctamente.`,
          'Creada'
        );
      },
      error: (err: ApiErrorResponse) => {
        console.error('Error al crear incertidumbre:', err);
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.error(
          err?.message || 'No se pudo crear la incertidumbre.',
          'Error al crear'
        );
      }
    });
  }

  // EDITAR (formulario vía AlertService, precargado)
  async editarIncertidumbre(u: Uncertainty): Promise<void> {
    this.idExpandido = null;
    if (!u) return;

    const dto = await this.formularioIncertidumbre(u);
    if (!dto) return;

    this.cargando = true;
    this.cdr.detectChanges();

    this.incService.actualizar(u.id, dto).subscribe({
      next: (res) => {
        if (res?.data) {
          this.listaInc = this.listaInc.map(x => x.id === u.id ? res.data : x);
        }
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.success(
          `Incertidumbre "${dto.clave}" actualizada.`,
          'Actualizada'
        );
      },
      error: (err: ApiErrorResponse) => {
        console.error('Error al actualizar incertidumbre:', err);
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.error(
          err?.message || 'No se pudo actualizar la incertidumbre.',
          'Error al actualizar'
        );
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // NUEVO FORMULARIO INTEGRADO (Reemplaza la secuencia de prompts)
  // ─────────────────────────────────────────────────────────────
  private async formularioIncertidumbre(base?: Uncertainty): Promise<CreateUncertaintyDto | null> {
    // Definimos los campos del formulario de forma declarativa
    const fields: AlertFormField[] = [
      {
        name: 'clave',
        label: 'Clave única',
        type: 'text',
        required: true,
        placeholder: 'Ej. U1, U2, U7',
        value: base?.clave ?? '',
      },
      {
        name: 'name',
        label: 'Nombre de la incertidumbre',
        type: 'text',
        required: true,
        placeholder: 'Incertidumbre por…',
        value: base?.name ?? '',
      },
      {
        name: 'description',
        label: 'Descripción',
        type: 'textarea',
        required: true,
        rows: 3,
        placeholder: 'Asociada a…',
        value: base?.description ?? '',
      },
      {
        name: 'type',
        label: 'Tipo',
        type: 'select',
        required: true,
        value: base?.type ?? 'TIPO A',
        options: this.TIPOS.map(t => ({ label: t, value: t }))
      },
      {
        name: 'distribution',
        label: 'Distribución',
        type: 'select',
        required: true,
        value: base?.distribution ?? 'NORMAL',
        options: this.DISTRIBUCIONES.map(d => ({ label: d, value: d }))
      }
    ];

    // Llamamos al AlertService.form() (método público que agregamos)
    const values = await this.alert.form({
      title: base ? 'Editar Incertidumbre' : 'Nueva Incertidumbre',
      message: base
        ? `Modifica los datos de la incertidumbre "${base.clave}".`
        : 'Ingresa los datos de la nueva incertidumbre.',
      type: 'question',
      confirmText: base ? 'Actualizar' : 'Guardar',
      cancelText: 'Cancelar',
      dismissible: false,
      size: 'md',
      form: {
        columns: 1,
        submitText: base ? 'Actualizar' : 'Guardar',
        validateOnSubmit: true,
        fields
      }
    });

    if (values === null) return null;

    // Extraemos y casteamos los valores (ya validados por el modal)
    return {
      clave: String(values['clave']).trim(),
      name: String(values['name']).trim(),
      description: String(values['description']).trim(),
      type: values['type'] as UncertaintyType,
      distribution: values['distribution'] as UncertaintyDistribution,
    };
  }

  // DESACTIVAR (baja lógica → obsolete = 1)
  async desactivarIncertidumbre(u: Uncertainty): Promise<void> {
    this.idExpandido = null;
    if (!u || this.eliminando.has(u.id)) return;

    const ok = await this.alert.confirm(
      `La incertidumbre "${u.clave} — ${u.name}" quedará marcada como obsoleta. Podrás reactivarla después.`,
      'Marcar como obsoleta',
      {
        type: 'warning',
        confirmText: 'Sí, marcar',
        cancelText: 'Cancelar',
        dismissible: false
      }
    );
    if (!ok) return;

    this.eliminando.add(u.id);
    this.cargando = true;
    this.cdr.detectChanges();

    this.incService.desactivar(u.id).subscribe({
      next: (res) => {
        if (res?.data) {
          this.listaInc = this.listaInc.map(x => x.id === u.id ? res.data : x);
        }
        this.eliminando.delete(u.id);
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.success(
          `Incertidumbre "${u.clave}" marcada como obsoleta.`,
          'Actualizada'
        );
      },
      error: (err: ApiErrorResponse) => {
        console.error('Error al desactivar:', err);
        this.eliminando.delete(u.id);
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.error(
          err?.message || 'No se pudo marcar como obsoleta.',
          'Error'
        );
      }
    });
  }

  // REACTIVAR (obsolete = 0)
  async reactivarIncertidumbre(u: Uncertainty): Promise<void> {
    this.idExpandido = null;
    if (!u || this.eliminando.has(u.id)) return;

    const ok = await this.alert.confirm(
      `La incertidumbre "${u.clave} — ${u.name}" volverá a estar activa.`,
      'Reactivar incertidumbre',
      {
        type: 'question',
        confirmText: 'Sí, reactivar',
        cancelText: 'Cancelar',
        dismissible: false
      }
    );
    if (!ok) return;

    this.eliminando.add(u.id);
    this.cargando = true;
    this.cdr.detectChanges();

    this.incService.activar(u.id).subscribe({
      next: (res) => {
        if (res?.data) {
          this.listaInc = this.listaInc.map(x => x.id === u.id ? res.data : x);
        }
        this.eliminando.delete(u.id);
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.success(
          `Incertidumbre "${u.clave}" reactivada.`,
          'Reactivada'
        );
      },
      error: (err: ApiErrorResponse) => {
        console.error('Error al reactivar:', err);
        this.eliminando.delete(u.id);
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.error(
          err?.message || 'No se pudo reactivar la incertidumbre.',
          'Error'
        );
      }
    });
  }

  // ELIMINAR (físico)
  async eliminarIncertidumbre(u: Uncertainty): Promise<void> {
    this.idExpandido = null;
    if (!u || this.eliminando.has(u.id)) return;

    const ok = await this.alert.confirm(
      `Se eliminará PERMANENTEMENTE la incertidumbre "${u.clave} — ${u.name}". Esta acción no se puede deshacer.`,
      'Eliminar incertidumbre',
      {
        type: 'error',
        confirmText: 'Sí, eliminar',
        cancelText: 'Cancelar',
        dismissible: false
      }
    );
    if (!ok) return;

    this.eliminando.add(u.id);
    this.cargando = true;
    this.cdr.detectChanges();

    this.incService.eliminar(u.id).subscribe({
      next: () => {
        this.listaInc = this.listaInc.filter(x => x.id !== u.id);
        this.eliminando.delete(u.id);
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.success(
          `Incertidumbre "${u.clave}" eliminada correctamente.`,
          'Eliminada'
        );
      },
      error: (err: ApiErrorResponse) => {
        console.error('Error al eliminar:', err);
        this.eliminando.delete(u.id);
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.error(
          err?.message || 'No se pudo eliminar la incertidumbre.',
          'Error al eliminar'
        );
      }
    });
  }

  // Navegación
  volver(): void {
    this.router.navigate(['/inicio']);
  }
}
