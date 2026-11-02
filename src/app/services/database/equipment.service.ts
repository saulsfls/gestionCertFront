import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map, shareReplay } from 'rxjs';
import { Global } from '../../../environment/environment';

export interface EquipoMin {
  name: string;
  idequipment: string;
}

export interface PatronCruzado {
  id: string;
  name: string;
  pt?: string;
  calibration_date?: string;
  months_calibration?: number;
  software_version?: string;
  deleted?: number | boolean;
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class EquipmentService {
  private patronesRaw$?: Observable<any[]>;
  private equiposRaw$?: Observable<any[]>;

  constructor(private http: HttpClient, private global: Global) {}

  /**
   * Obtiene los patrones de calibración SIN tratamiento de datos.
   * Devuelve exactamente lo que retorna el endpoint post.php.
   */
  getPatronesRaw(): Observable<any[]> {
    return (this.patronesRaw$ ??= this.getTabla(
      'calibraciones',
      'patron'
    ).pipe(shareReplay(1)));
  }

  /**
   * Obtiene el catálogo de equipos (equipment_catalog) SIN tratamiento de datos.
   * Devuelve exactamente lo que retorna el endpoint post.php,
   * sin mapear a EquipoMin ni recortar strings.
   */
  getEquipmentCatalogRaw(): Observable<any[]> {
    return (this.equiposRaw$ ??= this.getTabla(
      'hvtest2',
      'equipment_catalog'
    ).pipe(shareReplay(1)));
  }

  /**
   * Obtiene los patrones (delegando en el método raw cacheado).
   */
  getDatosPatron(): Observable<any[]> {
    return this.getPatronesRaw();
  }

  /**
   * Obtiene el catálogo de equipos mapeado a `EquipoMin`.
   */
  getDatosEquipos(): Observable<EquipoMin[]> {
    return this.getEquipmentCatalogRaw().pipe(
      map((equipos: any[]) =>
        equipos.map((e) => ({
          name: String(e.name ?? '').trim(),
          idequipment: String(e.idequipment ?? '').trim(),
        }))
      )
    );
  }

  /**
   * Cruza patrones con equipos para obtener los patrones cruzados.
   */
  getPatronesCruzados(): Observable<PatronCruzado[]> {
    return forkJoin({
      patrones: this.getDatosPatron(),
      equipos: this.getDatosEquipos(),
    }).pipe(
      map(({ patrones, equipos }) => this.cruzarPatronesEquipos(patrones, equipos)),
      shareReplay(1),
    );
  }

  /**
   * Dado un array de patrones crudos y un array de equipos,
   * reconstruye el `name` de cada patrón sustituyendo los `idequipment`
   * por sus nombres legibles.
   */
  cruzarPatronesEquipos(
    patrones: any[],
    equipos: EquipoMin[]
  ): PatronCruzado[] {
    const nombrePorIdeq = new Map<string, string>();
    for (const e of equipos) {
      if (e.idequipment && e.name) {
        nombrePorIdeq.set(e.idequipment, e.name);
      }
    }

    return patrones.map((p: any) => {
      const idCompuesto = String(p.name ?? '').trim();
      const partes = idCompuesto
        .split('+')
        .map((s) => s.trim())
        .filter(Boolean);

      const nombres = partes.map((parte) => {
        const nombre = nombrePorIdeq.get(parte);
        return nombre ?? parte;
      });

      const { id: _oldId, name: _oldName, ...resto } = p;
      return {
        id: idCompuesto,
        name: nombres.join('+'),
        ...resto,
      } as PatronCruzado;
    });
  }

  private getTabla(bd: string, table: string): Observable<any[]> {
    const req = { bd, action: 'get', table, opts: {} };
    console.log(req);
    return this.http
      .post<any>(`${this.global.URLCalibraciones}post.php`, req)
      .pipe(map((res) => res?.result ?? []));
  }
}
