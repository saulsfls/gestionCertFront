import { Component, OnInit } from '@angular/core';
import { EquipmentService } from '../../../services/database/equipment.service';
import { forkJoin } from 'rxjs';

@Component({
  imports: [],
  selector: 'app-viewdata',
  styleUrl: './viewdata.css',
  templateUrl: './viewdata.html',
})
export class Viewdata implements OnInit {
  patrones: any[] = [];
  equipos: any[] = [];

  constructor(private equipment: EquipmentService) {}

  ngOnInit(): void {
    this.getDatos();
  }

  getDatos(): void {
    forkJoin({
      patrones: this.equipment.getPatronesRaw(),
      equipos: this.equipment.getEquipmentCatalogRaw(),
    }).subscribe({
      next: ({ patrones, equipos }) => {
        this.patrones = patrones;
        this.equipos = equipos;
        console.log('Patrones (raw):', patrones);
        console.log('Equipment catalog (raw):', equipos);
      },
      error: (err) => {
        console.error('Error al obtener los datos:', err);
      },
    });
  }
}
