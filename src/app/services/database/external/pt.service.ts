import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, map, tap, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Global } from '../../../../environment/environment';
import { EquipmentService, PatronCruzado } from '../../database/external/equipment.service'; // ajusta la ruta
import { AlertService } from '../../core/alert.service';

export interface PtRaw {
  id?: string | number;
  pt?: string;
  description?: string;
  name?: string;
  descripcion?: string;
  [k: string]: unknown;
}

export interface PatronConPt {
  id: string;
  nombre: string;
  pt: string[];
}

export type PtAgrupadosPorPatron = Record<string, PtRaw[]>;

@Injectable({ providedIn: 'root' })
export class PtService {
  private readonly http = inject(HttpClient);
  private readonly global = inject(Global);
  private readonly equipmentSvc = inject(EquipmentService);
  private readonly alert = inject(AlertService);

  private ptRaw$?: Observable<any[]>;

  // ── Estado reactivo ────────────────────────────────────────
  readonly patrones            = signal<PatronConPt[]>([]);
  readonly ptDescripcionPorId  = signal<Map<string, string>>(new Map());
  readonly cargandoPatrones    = signal<boolean>(false);
  readonly errorPatrones       = signal<string | null>(null);

  // ── Catálogo de PT (con cache) ─────────────────────────────
  obtenerPt(): Observable<any[]> {
    return (this.ptRaw$ ??= this.getTabla('calibraciones', 'procedimientos_tecnicos').pipe(
      shareReplay(1)
    ));
  }

  /**
   * Carga patrones cruzados + descripciones de PT.
   * - Si falla `obtenerPt()`, igual intenta cargar los patrones.
   * - Si falla `getPatronesCruzados()`, muestra alert y resuelve.
   * Devuelve una Promesa que se resuelve SIEMPRE (no rechaza).
   */
  cargarPatronesAsync(): Promise<void> {
    this.cargandoPatrones.set(true);
    this.errorPatrones.set(null);

    return new Promise<void>((resolve) => {
      this.obtenerPt()
        .pipe(catchError((err) => {
          console.warn('Error cargando catálogo PT:', err);
          return of([] as any[]);   // seguimos con array vacío
        }))
        .subscribe({
          next: (ptRaw: any[]) => {
            // 1. Mapa id → descripción
            const map = new Map<string, string>();
            for (const pt of ptRaw ?? []) {
              const id = String(pt?.id ?? pt?.pt ?? '').trim();
              if (!id) continue;
              const desc = String(
                pt?.description ?? pt?.name ?? pt?.descripcion ?? ''
              ).trim();
              map.set(id, desc || id);
            }
            this.ptDescripcionPorId.set(map);

            // 2. Patrones cruzados
            this.equipmentSvc.getPatronesCruzados()
              .pipe(catchError((err) => {
                console.error('Error cargando patrones cruzados:', err);
                this.alert.error('No se pudieron cargar los patrones.', 'Error de carga');
                return of([] as PatronCruzado[]);
              }))
              .subscribe({
                next: (patronesCruzados: PatronCruzado[]) => {
                  this.patrones.set(this.agruparPatronesPorId(patronesCruzados));
                  this.cargandoPatrones.set(false);
                  resolve();
                },
                error: () => {
                  this.patrones.set([]);
                  this.cargandoPatrones.set(false);
                  this.errorPatrones.set('Error cargando patrones.');
                  resolve();
                },
              });
          },
          error: () => {
            // No debería pasar por el catchError, pero por si acaso
            this.cargandoPatrones.set(false);
            this.errorPatrones.set('Error cargando catálogo PT.');
            resolve();
          },
        });
    });
  }

  /**
   * Agrupa los patrones cruzados por su id.
   * Ajusta esta función a la forma real de `PatronCruzado`.
   */
  private agruparPatronesPorId(patronesCruzados: PatronCruzado[]): PatronConPt[] {
    const map = new Map<string, PatronConPt>();

    for (const pc of patronesCruzados ?? []) {
      const id = String((pc as any)?.id ?? (pc as any)?.patron_id ?? '').trim();
      if (!id) continue;

      const nombre = String(
        (pc as any)?.nombre ?? (pc as any)?.name ?? id
      ).trim();

      const ptsRaw = (pc as any)?.pt ?? (pc as any)?.pts ?? [];
      const pts = Array.isArray(ptsRaw)
        ? ptsRaw.map((p: any) => String(p?.id ?? p ?? '').trim()).filter(Boolean)
        : [];

      if (map.has(id)) {
        const existente = map.get(id)!;
        for (const p of pts) {
          if (!existente.pt.includes(p)) existente.pt.push(p);
        }
      } else {
        map.set(id, { id, nombre, pt: pts });
      }
    }

    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Devuelve la descripción de un PT por su id (o el mismo id). */
  descripcionPt(id: string): string {
    return this.ptDescripcionPorId().get(id) ?? id;
  }

  // ── Cache / agrupación clásica (se queda por compatibilidad) ──
  obtenerPtAgrupadosPorPatron(): Observable<PtAgrupadosPorPatron> {
    return this.obtenerPt().pipe(map((list) => this.agruparPorPatron(list)));
  }

  agruparPorPatron(ptList: PtRaw[]): PtAgrupadosPorPatron {
    const grupos: PtAgrupadosPorPatron = {};
    for (const pt of ptList) {
      const patrones = this.extraerPatrones(pt);
      if (patrones.length === 0) {
        (grupos['__sin_patron__'] ??= []).push(pt);
        continue;
      }
      for (const p of patrones) (grupos[p] ??= []).push(pt);
    }
    return grupos;
  }

  private extraerPatrones(pt: PtRaw): string[] {
    const encontrados = new Set<string>();
    const visitar = (valor: unknown, clave: string) => {
      if (valor === null || valor === undefined) return;
      if (Array.isArray(valor)) {
        for (const v of valor) visitar(v, clave);
        return;
      }
      if (typeof valor === 'object') {
        for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
          visitar(v, k);
        }
        return;
      }
      if (typeof valor === 'string') {
        const claveLower = clave.toLowerCase();
        const v = valor.trim();
        if (claveLower.includes('patron') || claveLower.includes('patrón')) {
          if (v) encontrados.add(v);
          return;
        }
        if (/^PAT/i.test(v)) encontrados.add(v);
      }
    };
    visitar(pt, '');
    return [...encontrados];
  }

  private getTabla(bd: string, table: string): Observable<any[]> {
    const req = { bd, action: 'get', table, opts: {} };
    return this.http
      .post<any>(`${this.global.URLCalibraciones}post.php`, req)
      .pipe(map((res) => res?.result ?? []));
  }
}
