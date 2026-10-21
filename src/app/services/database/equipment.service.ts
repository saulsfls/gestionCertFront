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
  constructor(private http: HttpClient, private global: Global) {}

  getDatosPatron(): Observable<any[]> {
    return this.getTabla('calibraciones', 'patron');
  }

  getDatosEquipos(): Observable<EquipoMin[]> {
    return this.getTabla('hvtest2', 'equipment_catalog').pipe(
      map((equipos: any[]) =>
        equipos.map((e) => ({
          name: String(e.name ?? '').trim(),
          idequipment: String(e.idequipment ?? '').trim(),
        }))
      )
    );
  }

  getPatronesCruzados(): Observable<PatronCruzado[]> {
    return forkJoin({
      patrones: this.getDatosPatron(),
      equipos: this.getDatosEquipos(),
    }).pipe(
      map(({ patrones, equipos }) => this.cruzarPatronesEquipos(patrones, equipos)),
      shareReplay(1),
    );
  }

  cruzarPatronesEquipos(
    patrones: any[],
    equipos: EquipoMin[]
  ): PatronCruzado[] {
    // 1. Mapa: idequipment → name
    const nombrePorIdeq = new Map<string, string>();
    for (const e of equipos) {
      if (e.idequipment && e.name) {
        nombrePorIdeq.set(e.idequipment, e.name);
      }
    }

    // 2. Recorrer patrones y reconstruir el objeto
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
    return this.http
      .post<any>(`${this.global.URLCalibraciones}post.php`, req)
      .pipe(map((res) => res?.result ?? []));
  }
}
