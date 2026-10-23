import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertService } from '../../../services/core/alert.service';
import { CmcService } from '../../../services/database/cmc.service';
import { ApiResponse } from '../../../models/certificado.models';
import { CmcData } from '../../../models/cmc.model';

type FiltroEstado = 'todos' | 'activos' | 'inactivos';

@Component({
  imports: [CommonModule, FormsModule],
  selector: 'app-listcmc',
  styleUrl: './listcmc.css',
  templateUrl: './listcmc.html',
})
export class Listcmc {

  private readonly alert = inject(AlertService);

  listaCmc: CmcData[] = [];
  cargando = false;

  textoBusqueda = '';
  filtroEstado: FiltroEstado = 'todos';

  idExpandido: number | null = null;
  cmcSeleccionado: CmcData | null = null;

  private desactivando: Set<number> = new Set();

  constructor(
    private cmcService: CmcService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.obtenerCmc();
  }

  // ---------------------------------------------------------------------------
  // Navegación
  // ---------------------------------------------------------------------------
  editarCmc(id?: number): void {
    if (!id) return;
    this.router.navigate(['/cmc-edit', id]);
  }

  detalleCmc(id?: number): void {
    if (!id) return;
    this.router.navigate(['/cmc-view', id]);
  }

  // ---------------------------------------------------------------------------
  // Helper: active puede venir como 0/1 o boolean
  // ---------------------------------------------------------------------------
  estaActivo(cmc: CmcData): boolean {
    return cmc.active === 1 || cmc.active === true;
  }

  // ---------------------------------------------------------------------------
  // Filtro reactivo
  // ---------------------------------------------------------------------------
  get cmcFiltrados(): CmcData[] {
    return this.listaCmc.filter((cmc) => {
      const activo = this.estaActivo(cmc);
      if (this.filtroEstado === 'activos' && !activo) return false;
      if (this.filtroEstado === 'inactivos' && activo) return false;

      if (!this.textoBusqueda.trim()) return true;

      const termino = this.textoBusqueda.toLowerCase().trim();
      const matchEquipment = cmc.id_equipment
        ? cmc.id_equipment.toLowerCase().includes(termino) : false;
      const matchCert = cmc.cert_associate
        ? cmc.cert_associate.toLowerCase().includes(termino) : false;
      const matchId = cmc.id != null
        ? String(cmc.id).toLowerCase().includes(termino) : false;

      return matchEquipment || matchCert || matchId;
    });
  }

  // ---------------------------------------------------------------------------
  // Carga de datos
  // ---------------------------------------------------------------------------
  obtenerCmc(): void {
    this.cargando = true;
    this.cdr.detectChanges();

    this.cmcService.obtenerCmcs().subscribe({
      next: (res: ApiResponse<CmcData[]>) => {
        if (res && res.ok && Array.isArray(res.data)) {
          this.listaCmc = res.data;
        } else if (Array.isArray(res)) {
          this.listaCmc = res as unknown as CmcData[];
        } else {
          this.listaCmc = [];
        }

        this.cargando = false;
        this.cdr.detectChanges();

        if (this.listaCmc.length > 0) {
          this.alert.success(
            `Se cargaron ${this.listaCmc.length} CMC${this.listaCmc.length === 1 ? '' : 's'}.`,
            'Lista actualizada'
          );
        } else {
          this.alert.info('No hay CMC registrados todavía.', 'Sin datos');
        }
      },
      error: (err: any) => {
        console.error('Error al obtener CMC:', err);
        this.cargando = false;
        this.cdr.detectChanges();
        const msg = err.error?.message || 'Error al conectar con la base de datos.';
        this.alert.error(msg, 'Error al cargar CMC');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Expansión del resumen
  // ---------------------------------------------------------------------------
  toggleDetalle(id: number | undefined, cmc: CmcData): void {
    if (!id) return;
    if (this.idExpandido === id) {
      this.idExpandido = null;
      this.cmcSeleccionado = null;
    } else {
      this.idExpandido = id;
      this.cmcSeleccionado = cmc;
    }
  }

  // ---------------------------------------------------------------------------
  // Desactivación con confirmación
  // ---------------------------------------------------------------------------
  async desactivarCmc(cmc: CmcData): Promise<void> {
    if (!this.estaActivo(cmc) || !cmc.id) return;
    if (this.desactivando.has(cmc.id)) return;

    const identificador = cmc.id_equipment || cmc.cert_associate || cmc.id;

    const confirmado = await this.alert.confirm(
      `El CMC "${identificador}" se marcará como inactivo. ¿Deseas continuar?`,
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

    this.desactivando.add(cmc.id);
    const estadoAnterior = cmc.active;
    cmc.active = 0;
    this.cdr.detectChanges();

    this.cmcService.desactivarCmc(cmc.id).subscribe({
      next: () => {
        this.desactivando.delete(cmc.id!);
        this.cdr.detectChanges();
        this.alert.success(
          `El CMC "${identificador}" ha sido desactivado con éxito.`,
          'Desactivado'
        );
      },
      error: (err: any) => {
        cmc.active = estadoAnterior;
        this.desactivando.delete(cmc.id!);
        this.cdr.detectChanges();
        const msg = err.error?.message
          || 'No se pudo desactivar el CMC en la base de datos.';
        this.alert.error(msg, 'Error al desactivar');
      },
    });
  }
}
