import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Certificado, ApiResponse, ResultTable } from '../models/certificado.models';

@Injectable({
  providedIn: 'root'
})
export class CertService {
  private apiUrl = 'http://192.168.1.187:3000/api'; // Ajusta según tu puerto/host

  constructor(private http: HttpClient) {}

  // Crear un nuevo certificado
  crearCertificado(certificado: Certificado): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/nuevo`, certificado);
  }
  // Obtener todos los certificados
  obtenerCertificados(): Observable<ApiResponse<Certificado[]>> {
    return this.http.get<ApiResponse<Certificado[]>>(`${this.apiUrl}/certificados`);
  }

  obtenerCertificadoCc(cc: string): Observable<ApiResponse<Certificado>> {
    return this.http.get<ApiResponse<Certificado>>(`${this.apiUrl}/certificados/cc/${encodeURIComponent(cc)}`);
  }

  // Obtener por ID o Equipment ID
  obtenerCertificadoPorId(id: string | number): Observable<ApiResponse<Certificado>> {
    return this.http.get<ApiResponse<Certificado>>(`${this.apiUrl}/certificados/${id}`);
  }

  // Modificar certificado
  actualizarCertificado(id: number | string, certificado: Certificado): Observable<ApiResponse<Certificado>> {
    return this.http.put<ApiResponse<Certificado>>(`${this.apiUrl}/certificados/${id}/save`, certificado);
  }

  // Activar certificado
  activarCertificado(id: number): Observable<ApiResponse<Certificado>> {
    return this.http.put<ApiResponse<Certificado>>(`${this.apiUrl}/certificados/${id}/activar`, {});
  }

  // Desactivar certificado
  desactivarCertificado(id: number): Observable<ApiResponse<Certificado>> {
    return this.http.put<ApiResponse<Certificado>>(`${this.apiUrl}/certificados/${id}/desactivar`, {});
  }

  //Procesamiento de la imagen
  procesarTabla(imageBase64: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/procesar-tabla`, { imageBase64 });
  }

  eliminarCertificado(id: number | string): Observable<ApiResponse<Certificado>> {
    return this.http.delete<ApiResponse<Certificado>>(`${this.apiUrl}/certificados/${id}/eliminar`);
  }

  obtenerEquipmentId(): Observable<ApiResponse<string[]>> {
    return this.http.get<ApiResponse<string[]>>(`${this.apiUrl}/equipos`);
  }

  obtenerTablas(equipmentId: string): Observable<ApiResponse<ResultTable[]>> {
    return this.http.get<ApiResponse<ResultTable[]>>(`${this.apiUrl}/equipos/${encodeURIComponent(equipmentId)}/tablas`
    );
  }

}
