import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Certificado, ApiResponse, ResultTable } from '../../models/certificado.models';
import { environment } from '../../../environment/environment';
import { AuthService } from '../auth/auth.service';

@Injectable({
  providedIn: 'root'
})
export class CertService {
  //El servicio se encarga de extraer certificados, tanto como creacion modificacion y eliminacion
  private apiUrl = environment.apiCertificados;

  private readonly auth = inject(AuthService);

  constructor(private http: HttpClient) {}

  private get actor(): string {
    const user = this.auth.getUser();
    const username = user?.username?.trim();
    if (username) return username;

    const idUser = user?.id_user?.trim();
    if (idUser) return idUser;

    return 'system';
  }

  // Crear un nuevo certificado
  crearCertificado(certificado: Certificado): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/nuevo`, {
      ...certificado,
      actor_id: this.actor,
    });
  }

  // Obtener todos los certificados
  obtenerCertificados(): Observable<ApiResponse<Certificado[]>> {
    return this.http.get<ApiResponse<Certificado[]>>(`${this.apiUrl}/certificados`);
  }

  obtenerCertificadoCc(cc: string): Observable<ApiResponse<Certificado>> {
    return this.http.get<ApiResponse<Certificado>>(
      `${this.apiUrl}/certificados/cc/${encodeURIComponent(cc)}`
    );
  }

  // Obtener por ID o Equipment ID
  obtenerCertificadoPorId(id: string | number): Observable<ApiResponse<Certificado>> {
    return this.http.get<ApiResponse<Certificado>>(`${this.apiUrl}/certificados/${id}`);
  }

  // Modificar certificado
  actualizarCertificado(id: number | string, certificado: Certificado): Observable<ApiResponse<Certificado>> {
    return this.http.put<ApiResponse<Certificado>>(`${this.apiUrl}/certificados/${id}/save`, {
      ...certificado,
      actor_id: this.actor,
    });
  }

  // Activar certificado
  activarCertificado(id: number): Observable<ApiResponse<Certificado>> {
    return this.http.put<ApiResponse<Certificado>>(
      `${this.apiUrl}/certificados/${id}/activar`,
      { actor_id: this.actor }
    );
  }

  // Desactivar certificado
  desactivarCertificado(id: number): Observable<ApiResponse<Certificado>> {
    return this.http.put<ApiResponse<Certificado>>(
      `${this.apiUrl}/certificados/${id}/desactivar`,
      { actor_id: this.actor }
    );
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
    return this.http.get<ApiResponse<ResultTable[]>>(
      `${this.apiUrl}/equipos/${encodeURIComponent(equipmentId)}/tablas`
    );
  }
}
