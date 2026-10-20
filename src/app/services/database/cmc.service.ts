import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../../models/certificado.models';
import { CmcData } from '../../models/cmc.model';
import { environment } from '../../../environment/environment';

@Injectable({
  providedIn: 'root'
})
export class CmcService {
  //Servicio encargado de guardar nuevos cmc, eliminar y mostrar
  private apiUrl = environment.apiCmc;

  constructor(private http: HttpClient) {}

  // Crear un nuevo registro de cálculo de CMC
  crearCmc(cmc: CmcData): Observable<ApiResponse<CmcData>> {
    return this.http.post<ApiResponse<CmcData>>(`${this.apiUrl}/cmc/nuevo`, cmc);
  }

  // Obtener todos los cálculos de CMC
  obtenerCmcs(): Observable<ApiResponse<CmcData[]>> {
    return this.http.get<ApiResponse<CmcData[]>>(`${this.apiUrl}/cmc`);
  }

  // Obtener un cálculo por su ID autoincremental
  obtenerCmcPorId(id: number | string): Observable<ApiResponse<CmcData>> {
    return this.http.get<ApiResponse<CmcData>>(`${this.apiUrl}/cmc/${id}`);
  }

  // Obtener el historial de cálculos de un equipo específico
  obtenerCmcPorEquipo(nameEquipment: string): Observable<ApiResponse<CmcData[]>> {
    return this.http.get<ApiResponse<CmcData[]>>(`${this.apiUrl}/cmc/equipo/${encodeURIComponent(nameEquipment)}`);
  }

  // Activar un cálculo de CMC
  activarCmc(id: number): Observable<ApiResponse<CmcData>> {
    return this.http.put<ApiResponse<CmcData>>(`${this.apiUrl}/cmc/${id}/activar`, {});
  }

  // Desactivar un cálculo de CMC (Baja lógica)
  desactivarCmc(id: number): Observable<ApiResponse<CmcData>> {
    return this.http.put<ApiResponse<CmcData>>(`${this.apiUrl}/cmc/${id}/desactivar`, {});
  }

  // Eliminar permanentemente un cálculo de CMC
  eliminarCmc(id: number | string): Observable<ApiResponse<CmcData>> {
    return this.http.delete<ApiResponse<CmcData>>(`${this.apiUrl}/cmc/${id}/eliminar`);
  }
}
