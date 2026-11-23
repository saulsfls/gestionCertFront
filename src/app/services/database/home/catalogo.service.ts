import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, tap, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../../environment/environment';
import {
  // Tipos base del catálogo
  UnidadItem,
  MagnitudCatalogo,
  MagnitudesMap,
  SubparametroCatalogo,
  TituloCatalogo,
  TitulosMap,
  CatalogoCompleto,

  // DTOs de creación
  CrearTituloDto,
  CrearSubparametroDto,
  CrearUnidadDto,
  CrearMagnitudDto,

  // Respuestas estándar del backend
  ApiResponse,
  ApiError,

  // Edición masiva (editor JSON)
  CatalogoId,
  ModoActualizacionCatalogo,
  ActualizarCatalogoCompletoDto,
  ActualizarCatalogoCompletoResponse,
} from '../../../models/catalogo.models';

/** Forma normalizada de error que consume la UI */
export interface NormalizedApiError {
  status: number;
  code: string | null;
  message: string;
  detail: string;
}

/** Unidad resuelta para un subparámetro, con su origen. */
export interface UnidadResuelta {
  simbolo: string;
  nombre: string;
  factor: string;
  prefijo: string;
  magnitudId: string;
  origen: 'heredada' | 'propia';
}

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private http = inject(HttpClient);

  /** Base de la API (sin barra final) */
  private baseUrl = environment.apiCatalogo.replace(/\/+$/, '');

  // ── Estado reactivo ──
  private titulosSignal  = signal<TitulosMap>({});
  private unidadesSignal = signal<MagnitudesMap>({});
  private cargandoSignal = signal<boolean>(false);
  private cargadoSignal  = signal<boolean>(false);

  readonly titulos  = this.titulosSignal.asReadonly();
  readonly unidades = this.unidadesSignal.asReadonly();
  readonly cargando = this.cargandoSignal.asReadonly();
  readonly cargado  = this.cargadoSignal.asReadonly();

  // ── Índice interno para lookups O(1) ──
  private titulosPorDisplay = computed(() => {
    const idx = new Map<string, TituloCatalogo>();
    for (const t of Object.values(this.titulosSignal())) {
      idx.set(t.displayName, t);
    }
    return idx;
  });

  // ── Derivados públicos ──

  readonly listaTitulos = computed(() => {
    return Object.entries(this.titulosSignal())
      .map(([id, t]) => ({ id, ...t }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
  });

  readonly listaMagnitudes = computed(() => {
    return Object.entries(this.unidadesSignal())
      .map(([id, m]) => ({ id, ...m }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  readonly todasLasUnidades = computed<string[]>(() => {
    const set = new Set<string>();
    Object.values(this.unidadesSignal()).forEach(m =>
      (m.unidades || []).forEach(u => set.add(u.simbolo))
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  });

  // ── CARGA ──

  cargarCatalogo(force = false): Observable<CatalogoCompleto> {
    if (this.cargadoSignal() && !force) {
      return of({ titulos: this.titulosSignal(), unidades: this.unidadesSignal() });
    }
    this.cargandoSignal.set(true);
    return this.http.get<ApiResponse<CatalogoCompleto>>(this.baseUrl).pipe(
      tap({
        next: (res) => {
          this.titulosSignal.set(res?.data?.titulos ?? {});
          this.unidadesSignal.set(res?.data?.unidades ?? {});
          this.cargadoSignal.set(true);
          this.cargandoSignal.set(false);
        },
        error: () => this.cargandoSignal.set(false)
      }),
      map((res) => res.data ?? { titulos: {}, unidades: {} }),
      catchError((err: HttpErrorResponse) => {
        console.error('Error al cargar el catálogo:', err);
        return throwError(() => this.parseError(err));
      })
    );
  }

  // ── ESCRITURAS ──

  /**
   * Crea un título nuevo y refresca el mapa de títulos.
   * El Observable no emite hasta que el estado local está actualizado.
   */
  crearTitulo(dto: CrearTituloDto): Observable<TituloCatalogo> {
    return this.http
      .post<ApiResponse<TituloCatalogo>>(`${this.baseUrl}/titulos`, dto)
      .pipe(
        switchMap((res) => {
          const created = this.unwrap(res);
          return this.refrescarTitulos().pipe(map(() => created));
        }),
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }

  /**
   * Crea un subparámetro dentro de un título.
   * Si `dto.unidadesOverride` viene con elementos, se consideran "propias";
   * si no, el subparámetro hereda las unidades de la magnitud del título.
   */
  crearSubparametro(dto: CrearSubparametroDto): Observable<SubparametroCatalogo> {
    return this.http
      .post<ApiResponse<SubparametroCatalogo>>(`${this.baseUrl}/subparametros`, dto)
      .pipe(
        switchMap((res) => {
          const created = this.unwrap(res);
          return this.refrescarTitulos().pipe(map(() => created));
        }),
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }

  /**
   * Crea una unidad nueva y refresca el mapa de unidades.
   * El Observable no emite hasta que el estado local está actualizado.
   */
  crearUnidad(dto: CrearUnidadDto): Observable<UnidadItem & { magnitud: string }> {
    return this.http
      .post<ApiResponse<UnidadItem & { magnitud: string }>>(`${this.baseUrl}/unidades`, dto)
      .pipe(
        switchMap((res) => {
          const created = this.unwrap(res);
          return this.refrescarUnidades().pipe(map(() => created));
        }),
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }

  /**
   * Crea una magnitud nueva y refresca el mapa de unidades.
   */
  crearMagnitud(dto: CrearMagnitudDto): Observable<MagnitudCatalogo & { id: string }> {
    return this.http
      .post<ApiResponse<MagnitudCatalogo & { id: string }>>(
        `${this.baseUrl}/magnitudes`,
        dto
      )
      .pipe(
        switchMap((res) => {
          const created = this.unwrap(res);
          return this.refrescarUnidades().pipe(map(() => created));
        }),
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }

  // ── EDICIÓN MASIVA (editor JSON) ──

  actualizarCatalogoCompleto(
      catalogId: CatalogoId,
      dto: ActualizarCatalogoCompletoDto
    ): Observable<ActualizarCatalogoCompletoResponse> {
      const payload: ActualizarCatalogoCompletoDto = {
        data: dto.data,
        modo: dto.modo ?? 'replace'
      };

      return this.http
        .put<ApiResponse<ActualizarCatalogoCompletoResponse>>(
          `${this.baseUrl}/${catalogId}`,
          payload
        )
        .pipe(
          switchMap((res) => {
            const resultado: ActualizarCatalogoCompletoResponse = this.unwrap(res);

            const refresco$: Observable<unknown> =
              catalogId === 'titulos'
                ? this.refrescarTitulos()
                : this.refrescarUnidades();

            return refresco$.pipe(switchMap(() => of(resultado)));
          }),
          catchError((err) => throwError(() => this.parseError(err)))
        );
    }

    reemplazarTitulos(
      data: TitulosMap
    ): Observable<ActualizarCatalogoCompletoResponse> {
      return this.actualizarCatalogoCompleto('titulos', {
        data,
        modo: 'replace'
      });
    }

    reemplazarUnidades(
      data: MagnitudesMap
    ): Observable<ActualizarCatalogoCompletoResponse> {
      return this.actualizarCatalogoCompleto('unidades', {
        data,
        modo: 'replace'
      });
    }

    fusionarTitulos(
      data: Partial<TitulosMap>
    ): Observable<ActualizarCatalogoCompletoResponse> {
      return this.actualizarCatalogoCompleto('titulos', {
        data: data as TitulosMap,
        modo: 'merge'
      });
    }

    fusionarUnidades(
      data: Partial<MagnitudesMap>
    ): Observable<ActualizarCatalogoCompletoResponse> {
      return this.actualizarCatalogoCompleto('unidades', {
        data: data as MagnitudesMap,
        modo: 'merge'
      });
    }

  /**
   * Descarga el JSON actual de un catálogo (para ofrecer "Descargar backup"
   * antes de un `replace` en el editor).
   */
  exportarCatalogo(
    catalogId: CatalogoId
  ): Observable<TitulosMap | MagnitudesMap> {
    const url =
      catalogId === 'titulos'
        ? `${this.baseUrl}/titulos`
        : `${this.baseUrl}/unidades`;

    return this.http
      .get<ApiResponse<TitulosMap | MagnitudesMap>>(url)
      .pipe(
        switchMap((res) => of(this.unwrap(res))),
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }

  // ── RESOLUCIÓN DE UNIDADES ──

  unidadesPara(tituloDisplay: string, subparametroDisplay: string): string[] {
    const titulo = this.buscarTituloPorDisplay(tituloDisplay);
    if (!titulo) return [];

    // Caso 2: comodín "Other" → todas las unidades
    if (titulo.magnitud === '*') {
      return this.todasLasUnidades();
    }

    // Caso 1: override del subparámetro
    const sub = (titulo.subparametros || []).find(
      (s) => s.displayName === subparametroDisplay
    );
    if (sub?.unidadesOverride && sub.unidadesOverride.length > 0) {
      return sub.unidadesOverride.slice();
    }

    // Caso 3: heredar de la magnitud
    const magnitud = this.unidadesSignal()[titulo.magnitud];
    return (magnitud?.unidades ?? []).map((u) => u.simbolo);
  }

  subparametrosDe(tituloDisplay: string): SubparametroCatalogo[] {
    return this.buscarTituloPorDisplay(tituloDisplay)?.subparametros ?? [];
  }

  unidadesDeMagnitud(magnitudId: string): string[] {
    const m = this.unidadesSignal()[magnitudId];
    return (m?.unidades ?? []).map((u) => u.simbolo);
  }

  infoUnidad(simbolo: string): {
    nombre: string; factor: string; prefijo: string; magnitud: string;
  } | null {
    for (const [magId, mag] of Object.entries(this.unidadesSignal())) {
      const u = (mag.unidades || []).find((x) => x.simbolo === simbolo);
      if (u) {
        return { nombre: u.nombre, factor: u.factor, prefijo: u.prefijo, magnitud: magId };
      }
    }
    return null;
  }

  /**
   * Magnitud efectiva de un subparámetro:
   *  - Si tiene override → inferimos la magnitud de los símbolos.
   *  - Si no → la magnitud del título.
   *  - Si el título es comodín `'*'` y no hay override → `'*'`.
   */
  magnitudDeSubparametro(
    tituloId: string,
    subDisplay: string
  ): string {
    const titulo = this.titulosSignal()[tituloId];
    if (!titulo) return '';
    const sub = (titulo.subparametros || []).find(
      (s) => s.displayName === subDisplay
    );
    if (sub?.unidadesOverride?.length) {
      return this.inferirMagnitudDeUnidades(sub.unidadesOverride) ?? titulo.magnitud;
    }
    return titulo.magnitud;
  }

  /**
   * Unidades resueltas de un subparámetro, con su origen (`propia` / `heredada`).
   * Es la fuente única de verdad para la vista de admin.
   */
  unidadesResueltasDeSubparametro(
    tituloId: string,
    subDisplay: string
  ): UnidadResuelta[] {
    const titulo = this.titulosSignal()[tituloId];
    if (!titulo) return [];
    const sub = (titulo.subparametros || []).find(
      (s) => s.displayName === subDisplay
    );

    // Override → propias
    if (sub?.unidadesOverride?.length) {
      const magId =
        this.inferirMagnitudDeUnidades(sub.unidadesOverride) ?? titulo.magnitud;
      const mag = this.unidadesSignal()[magId];
      return sub.unidadesOverride.map((simbolo) => {
        const u = (mag?.unidades ?? []).find((x) => x.simbolo === simbolo);
        return {
          simbolo,
          nombre: u?.nombre ?? simbolo,
          factor: u?.factor ?? '',
          prefijo: u?.prefijo ?? '',
          magnitudId: magId,
          origen: 'propia' as const
        };
      });
    }

    // Comodín del título → todas heredadas
    if (titulo.magnitud === '*') {
      const out: UnidadResuelta[] = [];
      for (const [magId, mag] of Object.entries(this.unidadesSignal())) {
        for (const u of mag.unidades ?? []) {
          out.push({
            simbolo: u.simbolo,
            nombre: u.nombre,
            factor: u.factor,
            prefijo: u.prefijo,
            magnitudId: magId,
            origen: 'heredada'
          });
        }
      }
      return out.sort((a, b) => a.simbolo.localeCompare(b.simbolo, 'es'));
    }

    // Heredadas de la magnitud del título
    const mag = this.unidadesSignal()[titulo.magnitud];
    return (mag?.unidades ?? []).map((u) => ({
      simbolo: u.simbolo,
      nombre: u.nombre,
      factor: u.factor,
      prefijo: u.prefijo,
      magnitudId: titulo.magnitud,
      origen: 'heredada' as const
    }));
  }

  // ── HELPERS DE LABEL ──

  labelDeTitulo(tituloDisplay: string): string {
    const t = this.buscarTituloPorDisplay(tituloDisplay);
    return (t?.label?.trim()) || t?.displayName || tituloDisplay;
  }

  labelDeSubparametro(tituloDisplay: string, subDisplay: string): string {
    const t = this.buscarTituloPorDisplay(tituloDisplay);
    const s = (t?.subparametros || []).find((x) => x.displayName === subDisplay);
    return (s?.label?.trim()) || s?.displayName || subDisplay;
  }

  // ── BÚSQUEDA ──

  buscarTitulos(termino: string): Array<{ id: string } & TituloCatalogo> {
    const norm = (s: string) =>
      String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q = norm(termino.trim());
    if (!q) return this.listaTitulos();
    return this.listaTitulos().filter(
      (t) => norm(t.displayName).includes(q) || norm(t.label ?? '').includes(q)
    );
  }

  // ── PRIVADOS ──

  /** Infiere la magnitud a la que pertenecen TODOS los símbolos (si coinciden). */
  private inferirMagnitudDeUnidades(simbolos: string[]): string | null {
    if (!simbolos?.length) return null;
    for (const [magId, mag] of Object.entries(this.unidadesSignal())) {
      const set = new Set((mag.unidades ?? []).map((u) => u.simbolo));
      if (simbolos.every((s) => set.has(s))) return magId;
    }
    return null;
  }

  private buscarTituloPorDisplay(display: string): TituloCatalogo | null {
    if (!display) return null;
    const exact = this.titulosPorDisplay().get(display);
    if (exact) return exact;
    // Fallback case/accent-insensitive
    const norm = (s: string) =>
      String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q = norm(display);
    for (const t of Object.values(this.titulosSignal())) {
      if (norm(t.displayName) === q) return t;
    }
    return null;
  }

  /** Refresca títulos y NO emite hasta que el signal está actualizado. */
  private refrescarTitulos(): Observable<TitulosMap> {
    return this.http.get<ApiResponse<TitulosMap>>(`${this.baseUrl}/titulos`).pipe(
      tap((res) => {
        if (res?.ok && res.data) this.titulosSignal.set(res.data);
      }),
      map((res) => res.data ?? {}),
      catchError((err) => {
        this.cargadoSignal.set(false);
        console.warn('No se pudo refrescar títulos:', err);
        return of({} as TitulosMap);
      })
    );
  }

  /** Refresca unidades y NO emite hasta que el signal está actualizado. */
  private refrescarUnidades(): Observable<MagnitudesMap> {
    return this.http.get<ApiResponse<MagnitudesMap>>(`${this.baseUrl}/unidades`).pipe(
      tap((res) => {
        if (res?.ok && res.data) this.unidadesSignal.set(res.data);
      }),
      map((res) => res.data ?? {}),
      catchError((err) => {
        this.cargadoSignal.set(false);
        console.warn('No se pudo refrescar unidades:', err);
        return of({} as MagnitudesMap);
      })
    );
  }

  /** Valida `ok` y extrae `data` o lanza error normalizado. */
  private unwrap<T>(res: ApiResponse<T>): T {
    if (!res || res.ok === false || res.data == null) {
      throw this.parseError({
        status: 200,
        error: {
          code: res?.ok === false ? 'API_NOT_OK' : 'EMPTY_DATA',
          message: 'Respuesta del backend sin datos válidos'
        }
      } as unknown as HttpErrorResponse);
    }
    return res.data;
  }

  private parseError(err: unknown): NormalizedApiError {
    if (err instanceof HttpErrorResponse) {
      const body = (err.error || {}) as ApiError;
      return {
        status: err.status,
        code: body.code ?? null,
        message: body.message || err.message || 'Error desconocido',
        detail: body.detail || ''
      };
    }
    return {
      status: 0,
      code: null,
      message: (err as Error)?.message ?? 'Error desconocido',
      detail: ''
    };
  }
}
