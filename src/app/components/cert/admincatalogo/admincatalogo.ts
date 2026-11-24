import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { CatalogoService } from '../../../services/database/home/catalogo.service';
import { AlertService } from '../../../services/core/alert.service';
import {
  TituloCatalogo,
  SubparametroCatalogo,
  MagnitudCatalogo,
  UnidadItem,
  CrearTituloDto,
  CrearSubparametroDto,
  CrearUnidadDto,
  CrearMagnitudDto,
  CatalogoId,
  ModoActualizacionCatalogo,
  TitulosMap,
  MagnitudesMap,
} from '../../../models/catalogo.models';
import { AuthService } from '../../../services/auth/auth.service';

type Tab = 'titulos' | 'magnitudes';

interface TituloRow extends TituloCatalogo {
  id: string;
}

interface MagnitudRow extends MagnitudCatalogo {
  id: string;
}

/** Unidad "resuelta" para un subparámetro, con su origen. */
interface UnidadResuelta {
  simbolo: string;
  nombre: string;
  factor: string;
  prefijo: string;
  magnitudId: string;
  origen: 'heredada' | 'propia';
}

interface SubparametroRow extends SubparametroCatalogo {
  tituloId: string;
  tituloDisplay: string;
  /** Magnitud efectiva del subparámetro (override o la del título). */
  magnitudEfectiva: string;
  /** true si el subparámetro define unidadesOverride. */
  tieneOverride: boolean;
  /** Unidades finales que se muestran (propias o heredadas). */
  unidades: UnidadResuelta[];
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
  private auth = inject(AuthService);

  // ── Estado ──
  activeTab: Tab = 'titulos';
  cargando = false;
  terminoBusqueda = '';

  /** id del título o magnitud expandida. Prefijos: "t::<id>" / "m::<id>". */
  expandidoId: string | null = null;

  titulosData: TituloRow[] = [];
  magnitudesData: MagnitudRow[] = [];
  /** Aplanado de subparámetros (para búsqueda global). */
  subparametrosData: SubparametroRow[] = [];
  unidadesData: UnidadRow[] = [];

  ngOnInit(): void {
    this.cargarTodo();
  }

  cargarTodo(force = false): void {
    this.cargando = true;
    this.cdr.detectChanges();

    this.catalogo.cargarCatalogo(force)
      .pipe(finalize(() => {
        this.cargando = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: () => {
          this.refrescarVistas();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.alert.error(
            err?.message ?? 'No se pudo cargar el catálogo.',
            'Error de catálogo'
          );
        },
      });
  }

  private refrescarVistas(): void {
    this.titulosData = this.catalogo.listaTitulos().map((t) => ({ ...t }));
    this.magnitudesData = this.catalogo.listaMagnitudes().map((m) => ({ ...m }));

    // Aplanar subparámetros con unidades resueltas
    const subs: SubparametroRow[] = [];
    for (const t of this.titulosData) {
      const magnitudTitulo = t.magnitud;
      for (const s of t.subparametros ?? []) {
        const tieneOverride = !!(s.unidadesOverride && s.unidadesOverride.length);
        const magnitudEfectiva = tieneOverride
          ? this.inferirMagnitudDeUnidades(s.unidadesOverride!) ?? magnitudTitulo
          : magnitudTitulo;

        const unidades = tieneOverride
          ? this.resolverUnidadesPropias(s.unidadesOverride!, magnitudEfectiva)
          : this.resolverUnidadesHeredadas(magnitudTitulo);

        subs.push({
          ...s,
          tituloId: t.id,
          tituloDisplay: t.displayName,
          magnitudEfectiva,
          tieneOverride,
          unidades,
        });
      }
    }
    this.subparametrosData = subs;

    // Aplanar unidades
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

  private inferirMagnitudDeUnidades(simbolos: string[]): string | null {
    if (!simbolos?.length) return null;
    for (const m of this.magnitudesData) {
      const set = new Set((m.unidades ?? []).map((u) => u.simbolo));
      if (simbolos.every((s) => set.has(s))) return m.id;
    }
    return null;
  }

  private resolverUnidadesHeredadas(magnitudId: string): UnidadResuelta[] {
    if (magnitudId === '*') {
      const out: UnidadResuelta[] = [];
      for (const m of this.magnitudesData) {
        for (const u of m.unidades ?? []) {
          out.push({
            simbolo: u.simbolo,
            nombre: u.nombre,
            factor: u.factor,
            prefijo: u.prefijo,
            magnitudId: m.id,
            origen: 'heredada',
          });
        }
      }
      return out.sort((a, b) => a.simbolo.localeCompare(b.simbolo, 'es'));
    }
    const mag = this.magnitudesData.find((m) => m.id === magnitudId);
    return (mag?.unidades ?? []).map((u) => ({
      simbolo: u.simbolo,
      nombre: u.nombre,
      factor: u.factor,
      prefijo: u.prefijo,
      magnitudId,
      origen: 'heredada' as const,
    }));
  }

  private resolverUnidadesPropias(
    simbolos: string[],
    magnitudId: string
  ): UnidadResuelta[] {
    const mag = this.magnitudesData.find((m) => m.id === magnitudId);
    return simbolos.map((simbolo) => {
      const u = mag?.unidades?.find((x) => x.simbolo === simbolo);
      return {
        simbolo,
        nombre: u?.nombre ?? simbolo,
        factor: u?.factor ?? '',
        prefijo: u?.prefijo ?? '',
        magnitudId,
        origen: 'propia' as const,
      };
    });
  }


  get titulosFiltrados(): TituloRow[] {
    const q = this.norm(this.terminoBusqueda);
    if (!q) return this.titulosData;
    return this.titulosData.filter(
      (t) =>
        this.norm(t.displayName).includes(q) ||
        this.norm(t.label ?? '').includes(q) ||
        this.norm(t.magnitud).includes(q) ||
        (t.subparametros ?? []).some((s) =>
          this.norm(s.displayName).includes(q)
        )
    );
  }

  get magnitudesFiltradas(): MagnitudRow[] {
    const q = this.norm(this.terminoBusqueda);
    if (!q) return this.magnitudesData;
    return this.magnitudesData.filter(
      (m) =>
        this.norm(m.id).includes(q) ||
        this.norm(m.nombre).includes(q) ||
        (m.unidades ?? []).some(
          (u) =>
            this.norm(u.simbolo).includes(q) || this.norm(u.nombre).includes(q)
        )
    );
  }

  private norm(s: string): string {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  subsDeTitulo(t: TituloRow): SubparametroRow[] {
    return this.subparametrosData
      .filter((s) => s.tituloId === t.id)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
  }

  nombreMagnitud(id: string): string {
    if (id === '*') return 'Comodín (todas las unidades)';
    return this.magnitudesData.find((m) => m.id === id)?.nombre ?? id;
  }

  simbolosDeMagnitud(id: string, max = 12): string {
    if (id === '*') return '…';
    const mag = this.magnitudesData.find((m) => m.id === id);
    const simbolos = (mag?.unidades ?? []).map((u) => u.simbolo);
    if (!simbolos.length) return '—';
    if (simbolos.length <= max) return simbolos.join(' · ');
    return simbolos.slice(0, max).join(' · ') + ` … (+${simbolos.length - max})`;
  }

  toggleTitulo(id: string): void {
    const key = `t::${id}`;
    this.expandidoId = this.expandidoId === key ? null : key;
  }

  toggleMagnitud(id: string): void {
    const key = `m::${id}`;
    this.expandidoId = this.expandidoId === key ? null : key;
  }

  estaExpandidoTitulo(id: string): boolean {
    return this.expandidoId === `t::${id}`;
  }

  estaExpandidoMagnitud(id: string): boolean {
    return this.expandidoId === `m::${id}`;
  }

  async crearTitulo(): Promise<void> {
    const magnitudes = this.catalogo.listaMagnitudes().map((m) => ({
      label: m.nombre,
      value: m.id,
    }));
    /*magnitudes.push({
      label: 'Comodín (acepta cualquier unidad)',
      value: '*',
    });*/

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
            label: 'Nombre en ingles (se guarda en el certificado)',
            type: 'text',
            required: true,
            minLength: 3,
            maxLength: 150,
            placeholder: 'ej. Teperature',
          },
          {
            name: 'label',
            label: 'Nombre en español (opcional, solo visual)',
            type: 'text',
            placeholder: 'ej. Temperatura',
          },
          {
            name: 'magnitud',
            label: 'Magnitud física por defecto',
            type: 'select',
            required: true,
            options: magnitudes,
          },
        ],
      },
    });
    if (values === null) return;

    const dto: CrearTituloDto = {
      displayName: String(values['displayName']).trim(),
      label: String(values['label'] ?? '').trim() || undefined,
      magnitud: String(values['magnitud'] ?? '').trim(),
    };

    this.ejecutar(
      this.catalogo.crearTitulo(dto),
      `Título "${dto.displayName}" creado.`
    );
  }

  async crearSubparametroEnTitulo(titulo: TituloRow): Promise<void> {
    const modoInicial = titulo.magnitud === '*' ? 'override' : 'heredar';

    const values = await this.alert.form({
      type: 'question',
      title: `Nuevo subparámetro en "${titulo.displayName}"`,
      message:
        'Define el nombre visible y si hereda las unidades del título o define las suyas propias.',
      confirmText: 'Crear subparámetro',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Crear subparámetro',
        validateOnSubmit: true,
        fields: [
          {
            name: 'displayName',
            label: 'Nombre en ingles (se guarda en el certificado)',
            type: 'text',
            required: true,
            minLength: 2,
            maxLength: 150,
            placeholder: 'ej. True Temperature',
          },
          {
            name: 'label',
            label: 'Nombre largo esapñol (opcional)',
            type: 'text',
            placeholder: 'ej. Temperatura verdadera',
          },
          {
            name: 'modo',
            label: '¿Cómo define sus unidades?',
            type: 'select',
            required: true,
            value: modoInicial,
            options: [
              {
                label: `Heredar del título (${this.nombreMagnitud(
                  titulo.magnitud
                )})`,
                value: 'heredar',
              },
              {
                label: 'Definir unidades propias (override)',
                value: 'override',
              },
            ],
          },
          {
            name: 'magnitudOverride',
            label: 'Magnitud de la que tomar las unidades',
            type: 'select',
            value: titulo.magnitud === '*' ? '' : titulo.magnitud,
            options: this.magnitudesData.map((m) => ({
              label: `${m.nombre} — ${this.simbolosDeMagnitud(m.id, 6)}`,
              value: m.id,
            })),
          },
          /*{
            name: 'unidadesOverride',
            label: 'Unidades propias (una por línea). Vacío = todas las de la magnitud',
            type: 'textarea',
            rows: 3,
            placeholder: 'ej.\nmV\nV\nkV',
          },*/
        ],
      },
    });
    if (values === null) return;

    const modo = String(values['modo'] ?? 'heredar');

    let unidadesOverride: string[] | undefined;
    if (modo === 'override') {
      const magnitudOverride = String(values['magnitudOverride'] ?? '').trim();
      if (!magnitudOverride) {
        this.alert.warning(
          'Debes seleccionar una magnitud para definir unidades propias.'
        );
        return;
      }

      const raw = String(values['unidadesOverride'] ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      if (raw.length) {
        const mag = this.magnitudesData.find((m) => m.id === magnitudOverride);
        const simbolosValidos = new Set(
          (mag?.unidades ?? []).map((u) => u.simbolo)
        );
        const invalidos = raw.filter((s) => !simbolosValidos.has(s));
        if (invalidos.length) {
          this.alert.error(
            `Estos símbolos no pertenecen a "${magnitudOverride}": ${invalidos.join(
              ', '
            )}`,
            'Unidades inválidas'
          );
          return;
        }
        unidadesOverride = raw;
      } else {
        const mag = this.magnitudesData.find((m) => m.id === magnitudOverride);
        unidadesOverride = (mag?.unidades ?? []).map((u) => u.simbolo);
      }
    }

    const dto: CrearSubparametroDto = {
      tituloId: titulo.id,
      displayName: String(values['displayName']).trim(),
      label: String(values['label'] ?? '').trim() || undefined,
      unidadesOverride,
    };

    this.ejecutar(
      this.catalogo.crearSubparametro(dto),
      `Subparámetro "${dto.displayName}" creado en "${titulo.displayName}".`
    );
  }

  async crearMagnitud(): Promise<void> {
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
    if (values === null) return;

    const unidadesIniciales = String(values['unidadesIniciales'] ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((linea) => {
        const [simbolo, nombre] = linea.split('|').map((s) => s.trim());
        return { simbolo: simbolo ?? '', nombre: nombre ?? simbolo ?? '' };
      })
      .filter((u) => u.simbolo && u.nombre);

    const dto: CrearMagnitudDto = {
      id: String(values['id']).trim(),
      nombre: String(values['nombre']).trim(),
      unidadesIniciales: unidadesIniciales.length ? unidadesIniciales : undefined,
    };

    this.ejecutar(
      this.catalogo.crearMagnitud(dto),
      `Magnitud "${dto.nombre}" creada.`
    );
  }

  // ============================================================
  // CREAR UNIDAD
  // ============================================================

  async crearUnidadEnMagnitud(magnitud: MagnitudRow): Promise<void> {
    const values = await this.alert.form({
      type: 'question',
      title: `Nueva unidad en "${magnitud.nombre}"`,
      message: `Agrega una unidad a la magnitud <b>${this.escape(
        magnitud.nombre
      )}</b>.`,
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
      magnitud: magnitud.id,
      simbolo: String(values['simbolo']).trim(),
      nombre: String(values['nombre']).trim(),
      factor: String(values['factor'] ?? '').trim() || undefined,
      prefijo: String(values['prefijo'] ?? '').trim() || undefined,
    };

    this.ejecutar(
      this.catalogo.crearUnidad(dto),
      `Unidad "${dto.simbolo}" creada en "${magnitud.nombre}".`
    );
  }

  async editarJsonCatalogo(catalogId: CatalogoId): Promise<void> {
    // 1) Pedir contraseña (mismo patrón que ya usas)
    const pass = await this.alert.prompt(
      'Ingrese la contraseña para acceder a la administración de certificados.',
      'Acceso restringido',
      {
        type: 'question',
        confirmText: 'Acceder',
        cancelText: 'Cancelar',
        dismissible: false,
        prompt: { placeholder: 'Contraseña…', defaultValue: '', inputType: 'password' },
      }
    );

    // 2) Canceló o vacío → salir
    if (pass === null) return;
    if (!pass) {
      this.alert.error('Debes ingresar una contraseña.', 'Acceso denegado');
      return;
    }

    // 3) Validar contra la contraseña fija del AuthService
    if (!this.auth.loginWithPassword(pass)) {
      this.alert.error('Contraseña incorrecta.', 'Acceso denegado');
      return;
    }else{
      this.alert.success('Puedes editar el JSON','Acceso concedido');
    }


    // 4) Cargar JSON actual
    let jsonActual: TitulosMap | MagnitudesMap;
    try {
      jsonActual = await new Promise((resolve, reject) => {
        this.catalogo.exportarCatalogo(catalogId).subscribe({
          next: (data) => resolve(data),
          error: (err) => reject(err),
        });
      });
    } catch (err: any) {
      this.alert.error(
        err?.message ?? 'No se pudo cargar el JSON actual del catálogo.',
        'Error'
      );
      return;
    }

    const jsonPretty = JSON.stringify(jsonActual, null, 2);

    // 5) Abrir editor
    const values = await this.alert.form({
      type: 'question',
      title: `Editar JSON del catálogo: ${catalogId}`,
      message:
        '<b>replace</b>: sobrescribe todo el catálogo.<br>' +
        '<b>merge</b>: fusiona solo las claves de primer nivel con lo existente.',
      confirmText: 'Guardar JSON',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'xl',
      form: {
        columns: 1,
        submitText: 'Guardar JSON',
        validateOnSubmit: true,
        fields: [
          {
            name: 'modo',
            label: 'Modo de actualización',
            type: 'select',
            required: true,
            value: 'replace' as ModoActualizacionCatalogo,
            options: [
              { label: 'Reemplazar todo (replace)', value: 'replace' },
              { label: 'Fusionar con lo existente (merge)', value: 'merge' },
            ],
          },
          {
            name: 'json',
            label: 'JSON del catálogo (editable)',
            type: 'textarea',
            rows: 28,
            required: true,
            value: jsonPretty,
            placeholder: '{\n  "clave": { ... }\n}',
          },
        ],
      },
    });

    if (values === null) return;

    // 6) Validar JSON (solo sintaxis y objeto plano)
    const rawJson = String(values['json'] ?? '').trim();
    if (!rawJson) {
      this.alert.warning('El JSON está vacío.', 'Sin cambios');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (e) {
      this.alert.error(
        `JSON inválido: ${(e as Error).message}`,
        'Error de sintaxis'
      );
      return;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.alert.error(
        'El JSON debe ser un objeto plano (no array, no null).',
        'Estructura inválida'
      );
      return;
    }

    const modo = String(values['modo'] ?? 'replace') as ModoActualizacionCatalogo;

    // 7) Guardar
    this.cargando = true;
    this.cdr.detectChanges();

    this.catalogo
      .actualizarCatalogoCompleto(catalogId, {
        data: parsed as TitulosMap | MagnitudesMap,
        modo,
      })
      .pipe(
        finalize(() => {
          this.cargando = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (res) => {
          this.alert.success(
            `Catálogo "${res.catalogId}" actualizado (${res.total} claves, modo ${res.modo}).`,
            'Éxito'
          );
          this.cargarTodo(true);
        },
        error: (err) => {
          this.alert.error(
            err?.message ?? 'No se pudo guardar el JSON del catálogo.',
            'Error'
          );
        },
      });
  }
  // ============================================================
  // EJECUCIÓN
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

  /** Botón de acción principal: crea según la sección activa. */
  crearSegunTab(): void {
    switch (this.activeTab) {
      case 'titulos':     return void this.crearTitulo();
      case 'magnitudes':  return void this.crearMagnitud();
    }
  }

  // ============================================================
  // UI HELPERS
  // ============================================================

  private escape(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  trackTitulo = (_: number, t: TituloRow) => t.id;
  trackMagnitud = (_: number, m: MagnitudRow) => m.id;
  trackSub = (_: number, s: SubparametroRow) => `${s.tituloId}::${s.id}`;
  trackUnidad = (_: number, u: UnidadResuelta) => `${u.magnitudId}::${u.simbolo}`;
  trackUnidadSimple = (_: number, u: { simbolo: string }) => u.simbolo;
}
