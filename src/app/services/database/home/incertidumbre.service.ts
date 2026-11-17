import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../environment/environment'; // ajusta ruta
import {
  Uncertainty,
  CreateUncertaintyDto,
  UpdateUncertaintyDto,
  ApiResponse,
  ApiListResponse,
  ApiErrorResponse
} from '../../../models/incertidumbre.model';

@Injectable({ providedIn: 'root' })
export class IncertidumbreService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiInc}`;


  // CREATE
  // POST /incertidumbres/nuevo

  crear(dto: CreateUncertaintyDto): Observable<ApiResponse<Uncertainty>> {
    return this.http
      .post<ApiResponse<Uncertainty>>(`${this.baseUrl}/nuevo`, dto)
      .pipe(catchError(this.handleError));
  }


  // READ (listado)
  // GET /incertidumbres?incluirObsoletos=true|false

  listar(incluirObsoletos = false): Observable<ApiListResponse<Uncertainty>> {
    const params = new HttpParams().set('incluirObsoletos', String(incluirObsoletos));
    return this.http
      .get<ApiListResponse<Uncertainty>>(this.baseUrl, { params })
      .pipe(catchError(this.handleError));
  }

  // GET /incertidumbres/obsoletos
  listarObsoletos(): Observable<ApiListResponse<Uncertainty>> {
    return this.http
      .get<ApiListResponse<Uncertainty>>(`${this.baseUrl}/obsoletos`)
      .pipe(catchError(this.handleError));
  }

  // GET /incertidumbres/:id  (incluye obsoletos)
  obtenerPorId(id: number): Observable<ApiResponse<Uncertainty>> {
    return this.http
      .get<ApiResponse<Uncertainty>>(`${this.baseUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

  // GET /incertidumbres/clave/:clave
  obtenerPorClave(clave: string): Observable<ApiResponse<Uncertainty>> {
    return this.http
      .get<ApiResponse<Uncertainty>>(`${this.baseUrl}/clave/${encodeURIComponent(clave)}`)
      .pipe(catchError(this.handleError));
  }

  // GET /incertidumbres/tipo/:tipo
  listarPorTipo(
    type: 'TIPO A' | 'TIPO B',
    incluirObsoletos = false
  ): Observable<ApiListResponse<Uncertainty>> {
    const params = new HttpParams().set('incluirObsoletos', String(incluirObsoletos));
    return this.http
      .get<ApiListResponse<Uncertainty>>(
        `${this.baseUrl}/tipo/${encodeURIComponent(type)}`,
        { params }
      )
      .pipe(catchError(this.handleError));
  }

  // GET /incertidumbres/distribucion/:distribucion
  listarPorDistribucion(
    distribution: Uncertainty['distribution'],
    incluirObsoletos = false
  ): Observable<ApiListResponse<Uncertainty>> {
    const params = new HttpParams().set('incluirObsoletos', String(incluirObsoletos));
    return this.http
      .get<ApiListResponse<Uncertainty>>(
        `${this.baseUrl}/distribucion/${encodeURIComponent(distribution)}`,
        { params }
      )
      .pipe(catchError(this.handleError));
  }


  // UPDATE (parcial)
  // PATCH /incertidumbres/:id

  actualizar(id: number, dto: UpdateUncertaintyDto): Observable<ApiResponse<Uncertainty>> {
    return this.http
      .patch<ApiResponse<Uncertainty>>(`${this.baseUrl}/${id}`, dto)
      .pipe(catchError(this.handleError));
  }


  // SOFT DELETE / RESTORE
  // PUT /incertidumbres/:id/desactivar
  // PUT /incertidumbres/:id/activar

  desactivar(id: number): Observable<ApiResponse<Uncertainty>> {
    return this.http
      .put<ApiResponse<Uncertainty>>(`${this.baseUrl}/${id}/desactivar`, {})
      .pipe(catchError(this.handleError));
  }

  activar(id: number): Observable<ApiResponse<Uncertainty>> {
    return this.http
      .put<ApiResponse<Uncertainty>>(`${this.baseUrl}/${id}/activar`, {})
      .pipe(catchError(this.handleError));
  }


  // DELETE (físico)
  // DELETE /incertidumbres/:id/eliminar

  eliminar(id: number): Observable<ApiResponse<Uncertainty>> {
    return this.http
      .delete<ApiResponse<Uncertainty>>(`${this.baseUrl}/${id}/eliminar`)
      .pipe(catchError(this.handleError));
  }


  // Manejo de errores

  private handleError(error: HttpErrorResponse): Observable<never> {
    // Error de red / CORS / servidor caído
    if (error.status === 0) {
      return throwError(() => ({
        ok: false,
        message: 'No se pudo conectar con el servidor. Verifica tu conexión.'
      } as ApiErrorResponse));
    }

    // El backend responde con { ok:false, message, ... }
    const body = error.error as ApiErrorResponse | undefined;
    if (body && typeof body === 'object' && 'message' in body) {
      return throwError(() => body);
    }

    // Fallback genérico
    return throwError(() => ({
      ok: false,
      message: `Error ${error.status}: ${error.statusText || 'desconocido'}`
    } as ApiErrorResponse));
  }
}
