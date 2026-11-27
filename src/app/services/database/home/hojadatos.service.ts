import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../../environment/environment';
import { AuthService } from '../../auth/auth.service';
import {
  DataSheet,
  DataSheetCreate,
  DataSheetUpdate,
  VincularPayload,
  VinculoCalDataSheet,
  ResultadoModular,
  ApiResponse,
} from '../../../models/hojadatos.models';

@Injectable({ providedIn: 'root' })
export class HojadatosService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = environment.apiHojaDatos;

  private readonly _hojas = signal<DataSheet[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly hojas = this._hojas.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  private currentActor(): string {
    return this.auth.getUser()?.id_user?.trim() || 'system';
  }

  private parseError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as Partial<ApiResponse<unknown>> | null;
      if (body?.detalles?.length) {
        return `${body.message ?? 'Validación'}: ${body.detalles.join(' | ')}`;
      }
      return body?.message ?? body?.detail ?? err.message ?? 'Error de red';
    }
    return (err as Error)?.message ?? 'Error desconocido';
  }

  // ── CRUD ─────────────────────────────────────────────────

  crear(payload: DataSheetCreate): Observable<DataSheet> {
    this._loading.set(true);
    const actor = this.currentActor();
    const body = { ...payload, created_by: actor, actor_id: actor };

    return this.http
      .post<ApiResponse<DataSheet>>(`${this.baseUrl}/nuevo`, body)
      .pipe(
        map((res) => res.data),
        tap((hoja) => {
          this._hojas.update((l) => [...l, hoja]);
          this._loading.set(false);
        }),
        catchError((err) => {
          this._loading.set(false);
          this._error.set(this.parseError(err));
          return throwError(() => err);
        })
      );
  }

  listar(): Observable<DataSheet[]> {
    this._loading.set(true);
    return this.http.get<ApiResponse<DataSheet[]>>(this.baseUrl).pipe(
      map((res) => res.data),
      tap((lista) => {
        this._hojas.set(lista);
        this._loading.set(false);
      }),
      catchError((err) => {
        this._loading.set(false);
        this._error.set(this.parseError(err));
        return throwError(() => err);
      })
    );
  }

  obtenerPorId(id: number): Observable<DataSheet> {
    return this.http
      .get<ApiResponse<DataSheet>>(`${this.baseUrl}/${id}`)
      .pipe(
        map((res) => res.data),
        catchError((err) => throwError(() => err))
      );
  }

  porEquipo(equipmentId: string): Observable<DataSheet[]> {
    return this.http
      .get<ApiResponse<DataSheet[]>>(
        `${this.baseUrl}/equipo/${encodeURIComponent(equipmentId)}`
      )
      .pipe(
        map((res) => res.data),
        catchError((err) => throwError(() => err))
      );
  }

  porEquipoPt(equipmentId: string, pt: string): Observable<DataSheet[]> {
    return this.http
      .get<ApiResponse<DataSheet[]>>(
        `${this.baseUrl}/equipo/${encodeURIComponent(equipmentId)}/pt/${encodeURIComponent(pt)}`
      )
      .pipe(
        map((res) => res.data),
        catchError((err) => throwError(() => err))
      );
  }

  porPt(pt: string): Observable<DataSheet[]> {
    return this.http
      .get<ApiResponse<DataSheet[]>>(`${this.baseUrl}/pt/${encodeURIComponent(pt)}`)
      .pipe(
        map((res) => res.data),
        catchError((err) => throwError(() => err))
      );
  }

  listarEquipos(): Observable<string[]> {
    return this.http
      .get<ApiResponse<string[]>>(`${this.baseUrl}/equipos`)
      .pipe(
        map((res) => res.data),
        catchError((err) => throwError(() => err))
      );
  }

  actualizar(id: number, cambios: DataSheetUpdate): Observable<DataSheet> {
    const actor = this.currentActor();
    const body = { ...cambios, updated_by: actor, actor_id: actor };
    return this.http
      .patch<ApiResponse<DataSheet>>(`${this.baseUrl}/${id}`, body)
      .pipe(
        map((res) => res.data),
        tap((hoja) =>
          this._hojas.update((l) => l.map((h) => (h.id === id ? hoja : h)))
        ),
        catchError((err) => throwError(() => err))
      );
  }

  eliminar(id: number): Observable<DataSheet> {
    return this.http
      .delete<ApiResponse<DataSheet>>(`${this.baseUrl}/${id}/eliminar`)
      .pipe(
        map((res) => res.data),
        tap(() => this._hojas.update((l) => l.filter((h) => h.id !== id))),
        catchError((err) => throwError(() => err))
      );
  }

  // ── Vínculos ─────────────────────────────────────────────

  vincular(id: number, payload: VincularPayload): Observable<VinculoCalDataSheet> {
    const body = { ...payload, calculated_by: this.currentActor() };
    return this.http
      .post<ApiResponse<VinculoCalDataSheet>>(
        `${this.baseUrl}/${id}/vincular`,
        body
      )
      .pipe(
        map((res) => res.data),
        catchError((err) => throwError(() => err))
      );
  }

  vinculosPorHoja(id: number): Observable<VinculoCalDataSheet[]> {
    return this.http
      .get<ApiResponse<VinculoCalDataSheet[]>>(
        `${this.baseUrl}/${id}/vinculos`
      )
      .pipe(
        map((res) => res.data),
        catchError((err) => throwError(() => err))
      );
  }

  // ── Consolidación ────────────────────────────────────────

  ultimosResultadosPorHoja(id: number): Observable<ResultadoModular[]> {
    return this.http
      .get<ApiResponse<ResultadoModular[]>>(
        `${this.baseUrl}/${id}/ultimos-resultados`
      )
      .pipe(
        map((res) => res.data),
        catchError((err) => throwError(() => err))
      );
  }

  presupuesto(equipmentId: string, pt: string): Observable<ResultadoModular[]> {
    return this.http
      .get<ApiResponse<ResultadoModular[]>>(
        `${this.baseUrl}/presupuesto/${encodeURIComponent(equipmentId)}/${encodeURIComponent(pt)}`
      )
      .pipe(
        map((res) => res.data),
        catchError((err) => throwError(() => err))
      );
  }

  // ── Utils ────────────────────────────────────────────────

  parseData<T = unknown>(hoja: DataSheet): T | null {
    const d = hoja.data as unknown;
    if (d == null) return null;
    if (typeof d === 'object') return d as T;
    try { return JSON.parse(d as string) as T; } catch { return null; }
  }

  reset(): void {
    this._hojas.set([]);
    this._error.set(null);
    this._loading.set(false);
  }
}
