import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environment/environment';

@Injectable({
  providedIn: 'root'
})
export class ImageService {

  private apiUrl = environment.apiImagen;

  constructor(private http: HttpClient) { }

  // ==================== 1 IMAGEN (COMPATIBILIDAD) ====================

  /**
   * Envía UNA imagen recortada (en base64) al servidor para procesar la tabla.
   * @param base64Image - Cadena base64 (con o sin prefijo data:image/...)
   * @returns Observable con la respuesta del servidor
   */
  procesarTabla(base64Image: string): Observable<any> {
    const { blob, mimeType } = this.base64ToBlob(base64Image);
    const extension = this.mimeTypeToExtension(mimeType);
    const file = new File([blob], `tabla_recortada.${extension}`, { type: mimeType });
    const formData = new FormData();
    formData.append('image', file);

    return this.http.post(`${this.apiUrl}/extract-table`, formData);
  }

  // ==================== N IMÁGENES (UNIÓN VERTICAL) ====================

  /**
   * Envía VARIAS imágenes (en base64) al servidor para que extraiga las tablas
   * y las una verticalmente. El backend valida que todas tengan el mismo
   * número de columnas.
   *
   * @param base64Images - Array de cadenas base64 (con o sin prefijo data:image/...)
   * @param order        - Orden en que deben apilarse las imágenes.
   *                       Ej: [2,0,1] indica que la 3ª imagen va primero.
   *                       Si se omite, se respeta el orden del array.
   * @returns Observable con la respuesta del servidor
   */
  procesarTablasMultiples(base64Images: string[], order?: number[]): Observable<any> {
    if (!base64Images || base64Images.length === 0) {
      throw new Error('Debes enviar al menos una imagen');
    }

    const formData = new FormData();

    base64Images.forEach((base64, index) => {
      const { blob, mimeType } = this.base64ToBlob(base64);
      const extension = this.mimeTypeToExtension(mimeType);
      const file = new File([blob], `tabla_${index}.${extension}`, { type: mimeType });
      formData.append('images', file);
    });

    // El backend espera "order" como JSON string
    if (order && Array.isArray(order) && order.length === base64Images.length) {
      formData.append('order', JSON.stringify(order));
    }

    return this.http.post(`${this.apiUrl}/extract-tables`, formData);
  }

  /**
   * Variante que acepta File[] ya construidos (útil si el usuario sube archivos
   * directamente desde un <input type="file"> en lugar de recortes base64).
   */
  procesarTablasMultiplesDesdeFiles(files: File[], order?: number[]): Observable<any> {
    if (!files || files.length === 0) {
      throw new Error('Debes enviar al menos un archivo');
    }

    const formData = new FormData();
    files.forEach((file, index) => {
      // Si el File no tiene nombre útil, le damos uno con índice
      const name = file.name && file.name !== 'blob'
        ? file.name
        : `tabla_${index}.${this.mimeTypeToExtension(file.type)}`;
      formData.append('images', file, name);
    });

    if (order && Array.isArray(order) && order.length === files.length) {
      formData.append('order', JSON.stringify(order));
    }

    return this.http.post(`${this.apiUrl}/extract-tables`, formData);
  }

  // ==================== HELPERS ====================

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

  /**
   * Deriva la extensión a partir del MIME type.
   * (image/jpeg -> jpg, image/tiff -> tiff, etc.)
   */
  private mimeTypeToExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/tiff': 'tiff',
      'image/webp': 'webp',
    };
    if (map[mimeType]) return map[mimeType];
    // fallback: toma la parte después de la barra
    const parts = mimeType.split('/');
    return parts[1] || 'png';
  }

  // ==================== ENDPOINTS AUXILIARES ====================

  getHealth(): Observable<any> {
    return this.http.get(`${this.apiUrl}/health`);
  }

  /**
   * Lista de modelos instalados en Ollama.
   * (Backend expone GET /modelos-instalados)
   */
  getModels(): Observable<any> {
    return this.http.get(`${this.apiUrl}/modelos-instalados`);
  }

  /**
   * Cambia el modelo activo.
   * (Backend expone POST /cambiar-modelo con body { model })
   */
  changeModel(modelName: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/cambiar-modelo`, { model: modelName });
  }

  /**
   * Verifica que el modelo actual responda.
   * (Backend expone GET /check-model)
   */
  checkModel(): Observable<any> {
    return this.http.get(`${this.apiUrl}/check-model`);
  }
}