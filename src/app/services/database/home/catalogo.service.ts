import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, tap, map } from 'rxjs/operators';
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

  // DTOs para los POST
  CrearTituloDto,
  CrearSubparametroDto,
  CrearUnidadDto,
  CrearMagnitudDto,

  // Respuestas estándar del backend
  ApiResponse,
  ApiError
} from '../../../models/catalogo.models';

// Servicio

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private http = inject(HttpClient);

  /** Base de la API. Ajusta si usas environment.apiUrl */
  private baseUrl = environment.apiCatalogo;

  // ── Estado reactivo ──
  private titulosSignal = signal<TitulosMap>({});
  private unidadesSignal = signal<MagnitudesMap>({});
  private cargandoSignal = signal<boolean>(false);
  private cargadoSignal = signal<boolean>(false);

  /** Exposición de solo lectura para los componentes */
  readonly titulos = this.titulosSignal.asReadonly();
  readonly unidades = this.unidadesSignal.asReadonly();
  readonly cargando = this.cargandoSignal.asReadonly();
  readonly cargado = this.cargadoSignal.asReadonly();

  // ── Derivados ──

  /** Lista plana de títulos para pintar en <select> */
  readonly listaTitulos = computed(() => {
    const map = this.titulosSignal();
    return Object.entries(map)
      .map(([id, t]) => ({ id, ...t }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
  });

  /** Lista plana de magnitudes para pintar en <select> */
  readonly listaMagnitudes = computed(() => {
    const map = this.unidadesSignal();
    return Object.entries(map)
      .map(([id, m]) => ({ id, ...m }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  /** Todas las unidades únicas del catálogo (para el comodín "Other") */
  readonly todasLasUnidades = computed<string[]>(() => {
    const set = new Set<string>();
    Object.values(this.unidadesSignal()).forEach(m =>
      (m.unidades || []).forEach(u => set.add(u.simbolo))
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  });


  // CARGA


  /**
   * Carga el catálogo completo desde el backend.
   * Idempotente: si ya está cargado, no vuelve a pedirlo salvo force = true.
   */
  cargarCatalogo(force = false): Observable<CatalogoCompleto> {
    if (this.cargadoSignal() && !force) {
      return of({
        titulos: this.titulosSignal(),
        unidades: this.unidadesSignal()
      });
    }

    this.cargandoSignal.set(true);

    return this.http.get<ApiResponse<CatalogoCompleto>>(this.baseUrl).pipe(
      tap({
        next: (res) => {
          const titulos = res?.data?.titulos ?? {};
          const unidades = res?.data?.unidades ?? {};
          this.titulosSignal.set(titulos);
          this.unidadesSignal.set(unidades);
          this.cargadoSignal.set(true);
          this.cargandoSignal.set(false);
        },
        error: () => {
          this.cargandoSignal.set(false);
        }
      }),
      map((res) => res.data ?? { titulos: {}, unidades: {} }),
      catchError((err: HttpErrorResponse) => {
        console.error('Error al cargar el catálogo:', err);
        return throwError(() => this.parseError(err));
      })
    );
  }


  // CREACIÓN


  crearTitulo(dto: CrearTituloDto): Observable<TituloCatalogo> {
    return this.http
      .post<ApiResponse<TituloCatalogo>>(`${this.baseUrl}/titulos`, dto)
      .pipe(
        tap(() => this.refrescarTitulos()),
        map((res) => res.data),
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }

  crearSubparametro(dto: CrearSubparametroDto): Observable<SubparametroCatalogo> {
    return this.http
      .post<ApiResponse<SubparametroCatalogo>>(`${this.baseUrl}/subparametros`, dto)
      .pipe(
        tap(() => this.refrescarTitulos()),
        map((res) => res.data),
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }

  crearUnidad(dto: CrearUnidadDto): Observable<UnidadItem & { magnitud: string }> {
    return this.http
      .post<ApiResponse<UnidadItem & { magnitud: string }>>(`${this.baseUrl}/unidades`, dto)
      .pipe(
        tap(() => this.refrescarUnidades()),
        map((res) => res.data),                          // ← faltaba esta línea
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }
  crearMagnitud(dto: CrearMagnitudDto): Observable<MagnitudCatalogo & { id: string }> {
    return this.http
      .post<ApiResponse<MagnitudCatalogo & { id: string }>>(`${this.baseUrl}/magnitudes`, dto)
      .pipe(
        tap(() => this.refrescarUnidades()),
        map((res) => res.data),
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }


  // RESOLUCIÓN DE UNIDADES (los 3 casos)


  /**
   * Devuelve las unidades disponibles para un par (título, subparámetro).
   *
   * Reglas:
   *  1. Si el subparámetro tiene unidadesOverride con elementos → usar esas.
   *  2. Si el título tiene magnitud '*' (comodín "Other") → todas las unidades.
   *  3. Heredar las unidades de la magnitud del título.
   */
  unidadesPara(tituloDisplay: string, subparametroDisplay: string): string[] {
    const titulo = this.buscarTituloPorDisplay(tituloDisplay);
    if (!titulo) return [];

    // Caso 2: comodín
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

  /**
   * Devuelve los subparámetros de un título por displayName.
   */
  subparametrosDe(tituloDisplay: string): SubparametroCatalogo[] {
    const titulo = this.buscarTituloPorDisplay(tituloDisplay);
    return titulo?.subparametros ?? [];
  }

  /**
   * Devuelve las unidades base de una magnitud (sin override).
   */
  unidadesDeMagnitud(magnitudId: string): string[] {
    const m = this.unidadesSignal()[magnitudId];
    return (m?.unidades ?? []).map((u) => u.simbolo);
  }

  /**
   * Info completa de una unidad (nombre largo, factor, prefijo) por símbolo.
   * Útil para tooltips o para mostrar el nombre debajo del input.
   */
  infoUnidad(simbolo: string): { nombre: string; factor: string; prefijo: string; magnitud: string } | null {
    for (const [magId, mag] of Object.entries(this.unidadesSignal())) {
      const u = (mag.unidades || []).find((x) => x.simbolo === simbolo);
      if (u) {
        return { nombre: u.nombre, factor: u.factor, prefijo: u.prefijo, magnitud: magId };
      }
    }
    return null;
  }


  // HELPERS DE LABEL


  /** Texto a mostrar para un título: label si existe, si no displayName */
  labelDeTitulo(tituloDisplay: string): string {
    const t = this.buscarTituloPorDisplay(tituloDisplay);
    return (t?.label?.trim()) || t?.displayName || tituloDisplay;
  }

  /** Texto a mostrar para un subparámetro: label si existe, si no displayName */
  labelDeSubparametro(tituloDisplay: string, subDisplay: string): string {
    const t = this.buscarTituloPorDisplay(tituloDisplay);
    const s = (t?.subparametros || []).find((x) => x.displayName === subDisplay);
    return (s?.label?.trim()) || s?.displayName || subDisplay;
  }


  // BÚSQUEDA AMIGABLE


  /**
   * Busca títulos por displayName o por label (case/accent-insensitive).
   * Útil para un buscador en la UI.
   */
  buscarTitulos(termino: string): Array<{ id: string } & TituloCatalogo> {
    const norm = (s: string) =>
      String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const q = norm(termino.trim());
    if (!q) return this.listaTitulos();
    return this.listaTitulos().filter(
      (t) => norm(t.displayName).includes(q) || norm(t.label ?? '').includes(q)
    );
  }


  // PRIVADOS


  private buscarTituloPorDisplay(display: string): TituloCatalogo | null {
    if (!display) return null;
    const map = this.titulosSignal();
    // Preferimos match exacto
    for (const t of Object.values(map)) {
      if (t.displayName === display) return t;
    }
    // Fallback: match case/accent-insensitive
    const norm = (s: string) =>
      String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const q = norm(display);
    for (const t of Object.values(map)) {
      if (norm(t.displayName) === q) return t;
    }
    return null;
  }

  private refrescarTitulos(): void {
    this.http
      .get<ApiResponse<TitulosMap>>(`${this.baseUrl}/titulos`)
      .subscribe({
        next: (res) => {
          if (res?.ok && res.data) {
            this.titulosSignal.set(res.data);
          }
        },
        error: (err) => console.warn('No se pudo refrescar títulos:', err)
      });
  }

  private refrescarUnidades(): void {
    this.http
      .get<ApiResponse<MagnitudesMap>>(`${this.baseUrl}/unidades`)
      .subscribe({
        next: (res) => {
          if (res?.ok && res.data) {
            this.unidadesSignal.set(res.data);
          }
        },
        error: (err) => console.warn('No se pudo refrescar unidades:', err)
      });
  }

  /**
   * Normaliza el error HTTP al shape que el resto del frontend espera.
   */
  private parseError(err: unknown): {
    status: number;
    code: string | null;
    message: string;
    detail: string;
  } {
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
  // ── PUT / DELETE ──

actualizarTitulo(id: string, dto: Partial<CrearTituloDto>): Observable<TituloCatalogo> {
  return this.http
    .put<ApiResponse<TituloCatalogo>>(`${this.baseUrl}/titulos/${id}`, dto)
    .pipe(
      tap(() => this.refrescarTitulos()),
      map((res) => res.data),
      catchError((err) => throwError(() => this.parseError(err)))
    );
}

eliminarTitulo(id: string): Observable<void> {
  return this.http
    .delete<ApiResponse<void>>(`${this.baseUrl}/titulos/${id}`)
    .pipe(
      tap(() => this.refrescarTitulos()),
      map(() => undefined),
      catchError((err) => throwError(() => this.parseError(err)))
    );
}

actualizarSubparametro(
  tituloId: string,
  displayName: string,
  dto: Partial<CrearSubparametroDto>
): Observable<SubparametroCatalogo> {
  return this.http
    .put<ApiResponse<SubparametroCatalogo>>(
      `${this.baseUrl}/titulos/${tituloId}/subparametros/${encodeURIComponent(displayName)}`,
      dto
    )
    .pipe(
      tap(() => this.refrescarTitulos()),
      map((res) => res.data),
      catchError((err) => throwError(() => this.parseError(err)))
    );
}

eliminarSubparametro(tituloId: string, displayName: string): Observable<void> {
  return this.http
    .delete<ApiResponse<void>>(
      `${this.baseUrl}/titulos/${tituloId}/subparametros/${encodeURIComponent(displayName)}`
    )
    .pipe(
      tap(() => this.refrescarTitulos()),
      map(() => undefined),
      catchError((err) => throwError(() => this.parseError(err)))
    );
}

  actualizarMagnitud(id: string, dto: Partial<CrearMagnitudDto>): Observable<MagnitudCatalogo & { id: string }> {
    return this.http
      .put<ApiResponse<MagnitudCatalogo & { id: string }>>(`${this.baseUrl}/magnitudes/${id}`, dto)
      .pipe(
        tap(() => this.refrescarUnidades()),
        map((res) => res.data),
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }

  eliminarMagnitud(id: string): Observable<void> {
    return this.http
      .delete<ApiResponse<void>>(`${this.baseUrl}/magnitudes/${id}`)
      .pipe(
        tap(() => this.refrescarUnidades()),
        map(() => undefined),
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }

  actualizarUnidad(
    magnitudId: string,
    simbolo: string,
    dto: Partial<CrearUnidadDto>
  ): Observable<UnidadItem & { magnitud: string }> {
    return this.http
      .put<ApiResponse<UnidadItem & { magnitud: string }>>(
        `${this.baseUrl}/magnitudes/${magnitudId}/unidades/${encodeURIComponent(simbolo)}`,
        dto
      )
      .pipe(
        tap(() => this.refrescarUnidades()),
        map((res) => res.data),
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }

  eliminarUnidad(magnitudId: string, simbolo: string): Observable<void> {
    return this.http
      .delete<ApiResponse<void>>(
        `${this.baseUrl}/magnitudes/${magnitudId}/unidades/${encodeURIComponent(simbolo)}`
      )
      .pipe(
        tap(() => this.refrescarUnidades()),
        map(() => undefined),
        catchError((err) => throwError(() => this.parseError(err)))
      );
  }
}
