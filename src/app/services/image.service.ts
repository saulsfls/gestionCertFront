import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ImageService {

  // Ahora la URL base incluye /api
  private apiUrl = 'http://192.168.1.161:3000/api';

  constructor(private http: HttpClient) { }

  /**
   * Envía la imagen recortada (en base64) al servidor para procesar la tabla.
   * @param base64Image - Cadena base64 (con o sin prefijo data:image/...)
   * @returns Observable con la respuesta del servidor
   */
  procesarTabla(base64Image: string): Observable<any> {
    const { blob, mimeType } = this.base64ToBlob(base64Image);
    const extension = mimeType.split('/')[1] || 'png';
    const file = new File([blob], `tabla_recortada.${extension}`, { type: mimeType });
    const formData = new FormData();
    formData.append('image', file);

    // Ruta correcta: /api/extract-table
    return this.http.post(`${this.apiUrl}/extract-table`, formData);
  }

  /**
   * Convierte base64 a Blob y extrae el tipo MIME.
   */
  private base64ToBlob(base64: string): { blob: Blob; mimeType: string } {
    let mimeType = 'image/png';
    let base64Data = base64;
    if (base64.includes(',')) {
      const parts = base64.split(',');
      const prefix = parts[0];
      const match = prefix.match(/data:(.*?);base64/);
      if (match) {
        mimeType = match[1];
      }
      base64Data = parts[1];
    }
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return { blob: new Blob([byteArray], { type: mimeType }), mimeType };
  }

  // Endpoints adicionales
  getHealth(): Observable<any> {
    return this.http.get(`${this.apiUrl}/health`);
  }

  getModels(): Observable<any> {
    return this.http.get(`${this.apiUrl}/models`);
  }

  changeModel(modelName: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/change-model`, { model: modelName });
  }
}
