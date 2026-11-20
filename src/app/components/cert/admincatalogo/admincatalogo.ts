import {
  Component,
  OnInit,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CatalogoService } from '../../../services/database/home/catalogo.service';
import { AlertService } from '../../../services/core/alert.service';
import {
  AlertFormField,
} from '../../core/alert/alert.model';
import {
  TituloCatalogo,
  SubparametroCatalogo,
  MagnitudCatalogo,
  UnidadItem,
  CrearTituloDto,
  CrearSubparametroDto,
  CrearUnidadDto,
  CrearMagnitudDto,
} from '../../../models/catalogo.models';

type Tab = 'titulos' | 'subparametros' | 'magnitudes' | 'unidades';

interface TituloRow extends TituloCatalogo {
  id: string;
}

interface MagnitudRow extends MagnitudCatalogo {
  id: string;
}

interface SubparametroRow extends SubparametroCatalogo {
  tituloId: string;
  tituloDisplay: string;
}

interface UnidadRow extends UnidadItem {
  magnitudId: string;
  magnitudNombre: string;
}

@Component({
  selector: 'app-admincatalog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admincatalogo.html',
  styleUrl: './admincatalogo.css',
})
export class Admincatalogo implements OnInit {
  private catalogo = inject(CatalogoService);
  private alert = inject(AlertService);
  private cdr = inject(ChangeDetectorRef);

  // ── Estado ──
  activeTab: Tab = 'titulos';
  cargando = false;
  terminoBusqueda = '';
  expandidoId: string | null = null;

  titulosData: TituloRow[] = [];
  magnitudesData: MagnitudRow[] = [];
  subparametrosData: SubparametroRow[] = [];
  unidadesData: UnidadRow[] = [];

  // ── Filtros por título / magnitud (subparámetros y unidades) ──
  filtroTituloId: string | null = null;
  filtroMagnitudId: string | null = null;

  ngOnInit(): void {
    this.cargarTodo();
  }

  // ============================================================
  // CARGA
  // ============================================================

  cargarTodo(force = false): void {
    this.cargando = true;
    this.catalogo.cargarCatalogo(force).subscribe({
      next: () => {
        this.refrescarVistas();
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.alert.error(
          err?.message ?? 'No se pudo cargar el catálogo.',
          'Error de catálogo'
        );
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });
  }

  private refrescarVistas(): void {
    this.titulosData = this.catalogo.listaTitulos().map((t) => ({ ...t }));
    this.magnitudesData = this.catalogo.listaMagnitudes().map((m) => ({ ...m }));

    const subs: SubparametroRow[] = [];
    for (const t of this.titulosData) {
      for (const s of t.subparametros ?? []) {
        subs.push({
          ...s,
          tituloId: t.id,
          tituloDisplay: t.displayName,
        });
      }
    }
    this.subparametrosData = subs;

    const unidades: UnidadRow[] = [];
    for (const m of this.magnitudesData) {
      for (const u of m.unidades ?? []) {
        unidades.push({
          ...u,
          magnitudId: m.id,
          magnitudNombre: m.nombre,
        });
      }
    }
    this.unidadesData = unidades;
  }

  // ============================================================
  // FILTROS
  // ============================================================

  get titulosFiltrados(): TituloRow[] {
    const q = this.norm(this.terminoBusqueda);
    if (!q) return this.titulosData;
    return this.titulosData.filter(
      (t) =>
        this.norm(t.displayName).includes(q) ||
        this.norm(t.label ?? '').includes(q) ||
        this.norm(t.magnitud).includes(q)
    );
  }

  get magnitudesFiltradas(): MagnitudRow[] {
    const q = this.norm(this.terminoBusqueda);
    if (!q) return this.magnitudesData;
    return this.magnitudesData.filter(
      (m) => this.norm(m.id).includes(q) || this.norm(m.nombre).includes(q)
    );
  }

  get subparametrosFiltrados(): SubparametroRow[] {
    const q = this.norm(this.terminoBusqueda);
    return this.subparametrosData.filter((s) => {
      if (this.filtroTituloId && s.tituloId !== this.filtroTituloId) return false;
      if (!q) return true;
      return (
        this.norm(s.displayName).includes(q) ||
        this.norm(s.label ?? '').includes(q) ||
        this.norm(s.tituloDisplay).includes(q)
      );
    });
  }

  get unidadesFiltradas(): UnidadRow[] {
    const q = this.norm(this.terminoBusqueda);
    return this.unidadesData.filter((u) => {
      if (this.filtroMagnitudId && u.magnitudId !== this.filtroMagnitudId) return false;
      if (!q) return true;
      return (
        this.norm(u.simbolo).includes(q) ||
        this.norm(u.nombre).includes(q) ||
        this.norm(u.magnitudNombre).includes(q)
      );
    });
  }

  private norm(s: string): string {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  // ============================================================
  // TÍTULOS
  // ============================================================

  async crearTitulo(): Promise<void> {
    const magnitudes = this.catalogo.listaMagnitudes().map((m) => ({
      label: m.nombre,
      value: m.id,
    }));
    magnitudes.push({ label: '＋ Crear nueva magnitud…', value: '__nueva__' });
    magnitudes.push({
      label: 'Comodín (acepta cualquier unidad)',
      value: '*',
    });

    const values = await this.alert.form({
      type: 'question',
      title: 'Nuevo título',
      message:
        'El "Nombre visible" es inmutable una vez creado (se guarda en los certificados).',
      confirmText: 'Crear título',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Crear título',
        validateOnSubmit: true,
        fields: [
          {
            name: 'displayName',
            label: 'Nombre visible (se guarda en el certificado)',
            type: 'text',
            required: true,
            minLength: 3,
            maxLength: 150,
            placeholder: 'ej. Temperature',
          },
          {
            name: 'label',
            label: 'Nombre largo (opcional, solo visual)',
            type: 'text',
            placeholder: 'ej. Temperatura',
          },
          {
            name: 'magnitud',
            label: 'Magnitud física',
            type: 'select',
            required: true,
            options: magnitudes,
          },
          {
            name: 'subparametrosIniciales',
            label: 'Subparámetros iniciales (uno por línea, opcional)',
            type: 'textarea',
            rows: 3,
            placeholder: 'ej.\nTemperature\nTrue Temperature',
          },
        ],
      },
    });
    if (values === null) return;

    let magnitudId = String(values['magnitud'] ?? '').trim();
    if (magnitudId === '__nueva__') {
      const nueva = await this.crearMagnitudFlow();
      if (!nueva) return;
      magnitudId = nueva;
    }

    const subparametrosIniciales = String(values['subparametrosIniciales'] ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((displayName) => ({ displayName }));

    const dto: CrearTituloDto = {
      displayName: String(values['displayName']).trim(),
      label: String(values['label'] ?? '').trim() || undefined,
      magnitud: magnitudId,
      subparametrosIniciales: subparametrosIniciales.length
        ? subparametrosIniciales
        : undefined,
    };

    this.ejecutar(
      this.catalogo.crearTitulo(dto),
      `Título "${dto.displayName}" creado.`
    );
  }

  async editarTitulo(titulo: TituloRow): Promise<void> {
    const magnitudes = this.catalogo.listaMagnitudes().map((m) => ({
      label: m.nombre,
      value: m.id,
    }));
    magnitudes.push({
      label: 'Comodín (acepta cualquier unidad)',
      value: '*',
    });

    const values = await this.alert.form({
      type: 'question',
      title: `Editar título "${titulo.displayName}"`,
      message:
        'El "Nombre visible" NO se puede cambiar (rompe certificados existentes). ' +
        'Solo puedes modificar el label y la magnitud.',
      confirmText: 'Guardar cambios',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Guardar cambios',
        validateOnSubmit: true,
        fields: [
          {
            name: 'displayName',
            label: 'Nombre visible (inmutable)',
            type: 'text',
            value: titulo.displayName,
            disabled: true,
          },
          {
            name: 'label',
            label: 'Nombre largo (opcional, solo visual)',
            type: 'text',
            value: titulo.label ?? '',
          },
          {
            name: 'magnitud',
            label: 'Magnitud física',
            type: 'select',
            required: true,
            value: titulo.magnitud,
            options: magnitudes,
          },
        ],
      },
    });
    if (values === null) return;

    this.ejecutar(
      this.catalogo.actualizarTitulo(titulo.id, {
        label: String(values['label'] ?? '').trim() || undefined,
        magnitud: String(values['magnitud'] ?? '').trim(),
      } as any),
      `Título "${titulo.displayName}" actualizado.`
    );
  }

  async eliminarTitulo(titulo: TituloRow): Promise<void> {
    const ok = await this.alert.confirm(
      `¿Eliminar el título "<b>${this.escape(titulo.displayName)}</b>"?<br>` +
        `<small class="text-danger">Esto también eliminará sus ${
          titulo.subparametros?.length ?? 0
        } subparámetro(s) y podría afectar certificados existentes.</small>`,
      '⚠ Eliminar título',
      {
        type: 'warning',
        confirmText: 'Sí, eliminar',
        cancelText: 'Cancelar',
        dismissible: false,
      }
    );
    if (!ok) return;

    this.ejecutar(
      this.catalogo.eliminarTitulo(titulo.id),
      `Título "${titulo.displayName}" eliminado.`
    );
  }

  // ============================================================
  // SUBPARÁMETROS
  // ============================================================

  async crearSubparametro(tituloId?: string): Promise<void> {
    if (!this.titulosData.length) {
      this.alert.warning('Primero crea al menos un título.');
      return;
    }

    const titulos = this.titulosData.map((t) => ({
      label: t.displayName,
      value: t.id,
    }));

    const values = await this.alert.form({
      type: 'question',
      title: 'Nuevo subparámetro',
      message:
        'El subparámetro se asocia a un título. Puedes sobrescribir sus unidades.',
      confirmText: 'Crear',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Crear subparámetro',
        validateOnSubmit: true,
        fields: [
          {
            name: 'tituloId',
            label: 'Título',
            type: 'select',
            required: true,
            value: tituloId ?? this.filtroTituloId ?? this.titulosData[0].id,
            options: titulos,
          },
          {
            name: 'displayName',
            label: 'Nombre visible (se guarda en el certificado)',
            type: 'text',
            required: true,
            minLength: 2,
            maxLength: 150,
            placeholder: 'ej. True Temperature',
          },
          {
            name: 'label',
            label: 'Nombre largo (opcional)',
            type: 'text',
            placeholder: 'ej. Temperatura verdadera',
          },
        ],
      },
    });
    if (values === null) return;

    const dto: CrearSubparametroDto = {
      tituloId: String(values['tituloId']),
      displayName: String(values['displayName']).trim(),
      label: String(values['label'] ?? '').trim() || undefined,
    };

    this.ejecutar(
      this.catalogo.crearSubparametro(dto),
      `Subparámetro "${dto.displayName}" creado.`
    );
  }

  async editarSubparametro(sub: SubparametroRow): Promise<void> {
    const values = await this.alert.form({
      type: 'question',
      title: `Editar subparámetro "${sub.displayName}"`,
      message:
        'El "Nombre visible" es inmutable. Solo puedes cambiar el label y el override de unidades.',
      confirmText: 'Guardar cambios',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Guardar cambios',
        validateOnSubmit: true,
        fields: [
          {
            name: 'tituloDisplay',
            label: 'Título',
            type: 'text',
            value: sub.tituloDisplay,
            disabled: true,
          },
          {
            name: 'displayName',
            label: 'Nombre visible (inmutable)',
            type: 'text',
            value: sub.displayName,
            disabled: true,
          },
          {
            name: 'label',
            label: 'Nombre largo (opcional)',
            type: 'text',
            value: sub.label ?? '',
          },
          {
            name: 'unidadesOverride',
            label: 'Override de unidades (una por línea, opcional)',
            type: 'textarea',
            rows: 3,
            value: (sub.unidadesOverride ?? []).join('\n'),
            placeholder: 'ej.\nmV\nV\nkV',
          },
        ],
      },
    });
    if (values === null) return;

    const override = String(values['unidadesOverride'] ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    this.ejecutar(
      this.catalogo.actualizarSubparametro(sub.tituloId, sub.id, {
        label: String(values['label'] ?? '').trim() || undefined,
        unidadesOverride: override.length ? override : undefined,
      } as any),
      `Subparámetro "${sub.displayName}" actualizado.`
    );
  }

  async eliminarSubparametro(sub: SubparametroRow): Promise<void> {
    const ok = await this.alert.confirm(
      `¿Eliminar el subparámetro "<b>${this.escape(sub.displayName)}</b>" del título "<b>${this.escape(
        sub.tituloDisplay
      )}</b>"?`,
      '⚠ Eliminar subparámetro',
      {
        type: 'warning',
        confirmText: 'Sí, eliminar',
        cancelText: 'Cancelar',
        dismissible: false,
      }
    );
    if (!ok) return;

    this.ejecutar(
      this.catalogo.eliminarSubparametro(sub.tituloId, sub.id),
      `Subparámetro "${sub.displayName}" eliminado.`
    );
  }

  // ============================================================
  // MAGNITUDES
  // ============================================================

  async crearMagnitud(): Promise<void> {
    const result = await this.crearMagnitudFlow();
    if (result) {
      this.alert.success(`Magnitud "${result}" creada.`, 'Éxito');
      this.cargarTodo(true);
    }
  }

  private async crearMagnitudFlow(): Promise<string | null> {
    const values = await this.alert.form({
      type: 'question',
      title: 'Nueva magnitud',
      message: 'Crea una magnitud física nueva (ej. temperature, pressure).',
      confirmText: 'Crear magnitud',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Crear magnitud',
        validateOnSubmit: true,
        fields: [
          {
            name: 'id',
            label: 'Identificador (slug)',
            type: 'text',
            required: true,
            placeholder: 'ej. temperature',
          },
          {
            name: 'nombre',
            label: 'Nombre',
            type: 'text',
            required: true,
            placeholder: 'ej. Temperatura',
          },
          {
            name: 'unidadesIniciales',
            label: 'Unidades iniciales (una por línea: simbolo|nombre)',
            type: 'textarea',
            rows: 3,
            placeholder: 'ej.\n°C|Celsius\n°F|Fahrenheit\nK|Kelvin',
          },
        ],
      },
    });
    if (values === null) return null;

    const unidadesIniciales = String(values['unidadesIniciales'] ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((linea) => {
        const [simbolo, nombre] = linea.split('|').map((s) => s.trim());
        return { simbolo: simbolo ?? '', nombre: nombre ?? simbolo ?? '' };
      })
      .filter((u) => u.simbolo && u.nombre);

    const id = String(values['id']).trim();

    return new Promise<string | null>((resolve) => {
      this.catalogo
        .crearMagnitud({
          id,
          nombre: String(values['nombre']).trim(),
          unidadesIniciales: unidadesIniciales.length
            ? unidadesIniciales
            : undefined,
        })
        .subscribe({
          next: () => resolve(id),
          error: (err) => {
            this.alert.error(err.message, 'Error al crear magnitud');
            resolve(null);
          },
        });
    });
  }

  async editarMagnitud(mag: MagnitudRow): Promise<void> {
    const values = await this.alert.form({
      type: 'question',
      title: `Editar magnitud "${mag.id}"`,
      message:
        'El identificador (slug) es inmutable. Solo puedes cambiar el nombre.',
      confirmText: 'Guardar cambios',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Guardar cambios',
        validateOnSubmit: true,
        fields: [
          {
            name: 'id',
            label: 'Identificador (inmutable)',
            type: 'text',
            value: mag.id,
            disabled: true,
          },
          {
            name: 'nombre',
            label: 'Nombre',
            type: 'text',
            required: true,
            value: mag.nombre,
          },
        ],
      },
    });
    if (values === null) return;

    this.ejecutar(
      this.catalogo.actualizarMagnitud(mag.id, {
        nombre: String(values['nombre']).trim(),
      } as any),
      `Magnitud "${mag.id}" actualizada.`
    );
  }

  async eliminarMagnitud(mag: MagnitudRow): Promise<void> {
    const ok = await this.alert.confirm(
      `¿Eliminar la magnitud "<b>${this.escape(mag.nombre)}</b>" (id: <code>${this.escape(
        mag.id
      )}</code>)?<br>` +
        `<small class="text-danger">Esto eliminará sus ${
          mag.unidades?.length ?? 0
        } unidad(es) y podría afectar títulos que la referencian.</small>`,
      '⚠ Eliminar magnitud',
      {
        type: 'warning',
        confirmText: 'Sí, eliminar',
        cancelText: 'Cancelar',
        dismissible: false,
      }
    );
    if (!ok) return;

    this.ejecutar(
      this.catalogo.eliminarMagnitud(mag.id),
      `Magnitud "${mag.id}" eliminada.`
    );
  }

  // ============================================================
  // UNIDADES
  // ============================================================

  async crearUnidad(magnitudId?: string): Promise<void> {
    if (!this.magnitudesData.length) {
      this.alert.warning('Primero crea al menos una magnitud.');
      return;
    }

    const magnitudes = this.magnitudesData.map((m) => ({
      label: m.nombre,
      value: m.id,
    }));

    const values = await this.alert.form({
      type: 'question',
      title: 'Nueva unidad',
      message: 'Agrega una unidad nueva a una magnitud existente.',
      confirmText: 'Crear unidad',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Crear unidad',
        validateOnSubmit: true,
        fields: [
          {
            name: 'magnitud',
            label: 'Magnitud',
            type: 'select',
            required: true,
            value:
              magnitudId ?? this.filtroMagnitudId ?? this.magnitudesData[0].id,
            options: magnitudes,
          },
          {
            name: 'simbolo',
            label: 'Símbolo',
            type: 'text',
            required: true,
            maxLength: 20,
            placeholder: 'ej. °C',
          },
          {
            name: 'nombre',
            label: 'Nombre',
            type: 'text',
            required: true,
            placeholder: 'ej. Celsius',
          },
          {
            name: 'factor',
            label: 'Factor (opcional)',
            type: 'text',
            placeholder: '10^0 (Base)',
          },
          {
            name: 'prefijo',
            label: 'Prefijo (opcional)',
            type: 'text',
            placeholder: 'Base',
          },
        ],
      },
    });
    if (values === null) return;

    const dto: CrearUnidadDto = {
      magnitud: String(values['magnitud']).trim(),
      simbolo: String(values['simbolo']).trim(),
      nombre: String(values['nombre']).trim(),
      factor: String(values['factor'] ?? '').trim() || undefined,
      prefijo: String(values['prefijo'] ?? '').trim() || undefined,
    };

    this.ejecutar(
      this.catalogo.crearUnidad(dto),
      `Unidad "${dto.simbolo}" creada en "${dto.magnitud}".`
    );
  }

  async editarUnidad(u: UnidadRow): Promise<void> {
    const values = await this.alert.form({
      type: 'question',
      title: `Editar unidad "${u.simbolo}"`,
      message: `Magnitud: <b>${this.escape(u.magnitudNombre)}</b>`,
      confirmText: 'Guardar cambios',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Guardar cambios',
        validateOnSubmit: true,
        fields: [
          {
            name: 'simbolo',
            label: 'Símbolo (inmutable)',
            type: 'text',
            value: u.simbolo,
            disabled: true,
          },
          {
            name: 'nombre',
            label: 'Nombre',
            type: 'text',
            required: true,
            value: u.nombre,
          },
          {
            name: 'factor',
            label: 'Factor',
            type: 'text',
            value: u.factor ?? '',
          },
          {
            name: 'prefijo',
            label: 'Prefijo',
            type: 'text',
            value: u.prefijo ?? '',
          },
        ],
      },
    });
    if (values === null) return;

    this.ejecutar(
      this.catalogo.actualizarUnidad(u.magnitudId, u.simbolo, {
        nombre: String(values['nombre']).trim(),
        factor: String(values['factor'] ?? '').trim() || undefined,
        prefijo: String(values['prefijo'] ?? '').trim() || undefined,
      } as any),
      `Unidad "${u.simbolo}" actualizada.`
    );
  }

  async eliminarUnidad(u: UnidadRow): Promise<void> {
    const ok = await this.alert.confirm(
      `¿Eliminar la unidad "<b>${this.escape(u.simbolo)}</b>" (${this.escape(
        u.nombre
      )}) de la magnitud "<b>${this.escape(u.magnitudNombre)}</b>"?`,
      '⚠ Eliminar unidad',
      {
        type: 'warning',
        confirmText: 'Sí, eliminar',
        cancelText: 'Cancelar',
        dismissible: false,
      }
    );
    if (!ok) return;

    this.ejecutar(
      this.catalogo.eliminarUnidad(u.magnitudId, u.simbolo),
      `Unidad "${u.simbolo}" eliminada.`
    );
  }

  // ============================================================
  // HELPERS DE EJECUCIÓN
  // ============================================================

  private ejecutar(
    obs: { subscribe: (o: any) => any },
    mensajeExito: string
  ): void {
    this.cargando = true;
    this.cdr.detectChanges();

    obs.subscribe({
      next: () => {
        this.cargarTodo(true);
        this.alert.success(mensajeExito, 'Éxito');
      },
      error: (err: any) => {
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.error(
          err?.message ?? 'Error al realizar la operación.',
          'Error'
        );
      },
    });
  }

  // ============================================================
  // UI HELPERS
  // ============================================================

  get hayTitulos(): boolean {
    return this.titulosData.length > 0;
  }

  get hayMagnitudes(): boolean {
    return this.magnitudesData.length > 0;
  }

  private escape(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ============================================================
  // TRACK BY
  // ============================================================
  toggleDetalle(id: string | number): void {
    const key = String(id);
    this.expandidoId = this.expandidoId === key ? null : key;
  }

  crearSegunTab(): void {
    switch (this.activeTab) {
      case 'titulos':       return void this.crearTitulo();
      case 'subparametros': return void this.crearSubparametro();
      case 'magnitudes':    return void this.crearMagnitud();
      case 'unidades':      return void this.crearUnidad();
    }
  }

  trackTitulo = (_: number, t: TituloRow) => t.id;
  trackMagnitud = (_: number, m: MagnitudRow) => m.id;
  trackSub = (_: number, s: SubparametroRow) => `${s.tituloId}::${s.id}`;
  trackUnidad = (_: number, u: UnidadRow) => `${u.magnitudId}::${u.simbolo}`;
}
