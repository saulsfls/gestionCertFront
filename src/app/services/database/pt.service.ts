import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, map } from 'rxjs';
import { Global } from '../../../environment/environment';

@Injectable({ providedIn: 'root' })
export class PtService {
  private ptRaw$?: Observable<any[]>;

  constructor(private http: HttpClient, private global: Global) {}

  /**
   * Obtiene los PT desde el endpoint post.php.
   * La estructura de la respuesta aún no está definida,
   * pero se accede igual que a los equipos.
   */
  obtenerPt(): Observable<any[]> {
    return (this.ptRaw$ ??= this.getTabla('calibraciones', 'procedimientos_tecnicos').pipe(
      shareReplay(1)
    ));
  }

  private getTabla(bd: string, table: string): Observable<any[]> {
    const req = { bd, action: 'get', table, opts: {} };
    console.log(req);
    return this.http
      .post<any>(`${this.global.URLCalibraciones}post.php`, req)
      .pipe(map((res) => res?.result ?? []));
  }
}
