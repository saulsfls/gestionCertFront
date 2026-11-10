import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { PtService } from '../../../services/database/pt.service';
import { EquipmentService } from '../../../services/database/equipment.service';

@Component({
  imports: [CommonModule],
  selector: 'app-viewdata',
  styleUrl: './viewdata.css',
  templateUrl: './viewdata.html',
})
export class Viewdata implements OnInit {
  // Variables para cada fuente de datos
  ptData: any[] = [];
  equipmentData: any[] = [];
  patronData: any[] = [];

  cargando = false;

  // Para alternar qué tabla estamos viendo
  activeTab: 'pt' | 'equipment' | 'patron' = 'pt';

  constructor(
    private ptService: PtService,
    private equipmentService: EquipmentService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.getDatos();
  }

  getDatos(): void {
    this.cargando = true;

    // Ejecutamos las 3 consultas al mismo tiempo
    forkJoin({
      pt: this.ptService.obtenerPt(),
      equipment: this.equipmentService.getEquipmentCatalogRaw(),
      // Nota: getPatronesRaw() está en EquipmentService (según el primer código que compartiste)
      patrones: this.equipmentService.getPatronesRaw()
    }).subscribe({
      next: (res) => {
        this.ptData = res.pt ?? [];
        this.equipmentData = res.equipment ?? [];
        this.patronData = res.patrones ?? [];

        console.log('=== DATOS PT ===', this.ptData);
        console.log('=== DATOS EQUIPOS ===', this.equipmentData);
        console.log('=== DATOS PATRONES ===', this.patronData);

        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error obteniendo datos:', err);
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ========== HELPERS PARA LAS TABLAS ==========

  /** Devuelve el array de datos según la pestaña activa */
  get datosActuales(): any[] {
    switch (this.activeTab) {
      case 'pt': return this.ptData;
      case 'equipment': return this.equipmentData;
      case 'patron': return this.patronData;
      default: return [];
    }
  }

  /** Devuelve todas las claves presentes en los registros actuales */
  getKeys(): string[] {
    const keys = new Set<string>();
    for (const row of this.datosActuales) {
      Object.keys(row ?? {}).forEach((k) => keys.add(k));
    }
    return Array.from(keys);
  }

  /** Formatea valores para mostrarlos en la tabla */
  formatValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
