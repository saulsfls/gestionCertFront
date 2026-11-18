import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { PtService } from '../../../services/database/external/pt.service';
import { EquipmentService } from '../../../services/database/external/equipment.service';
import { IncertidumbreService } from '../../../services/database/home/incertidumbre.service';
import { AlertService } from '../../../services/core/alert.service';
import { AlertFormField, AlertFormValues } from '../../core/alert/alert.model';

@Component({
  imports: [CommonModule],
  selector: 'app-viewdata',
  styleUrl: './viewdata.css',
  templateUrl: './viewdata.html',
})
export class Viewdata implements OnInit {
  ptData: any[] = [];
  equipmentData: any[] = [];
  patronData: any[] = [];

  cargando = false;

  activeTab: 'pt' | 'equipment' | 'patron' = 'pt';

  constructor(
    private ptService: PtService,
    private equipmentService: EquipmentService,
    private incService: IncertidumbreService,
    private cdr: ChangeDetectorRef,
    private alert: AlertService
  ) {}

  ngOnInit(): void {
    this.getDatos();
    this.getincertidumbreData();
  }

  getincertidumbreData(): void {
    this.incService.listar().subscribe({
      next: (res) => {
        console.log('Datos de las incertidumbres:');
        console.log(res);
      },
    });
  }

  getDatos(): void {
    this.cargando = true;

    forkJoin({
      pt: this.ptService.obtenerPt(),
      equipment: this.equipmentService.getEquipmentCatalogRaw(),
      patrones: this.equipmentService.getPatronesRaw(),
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
      },
    });
  }

  get datosActuales(): any[] {
    switch (this.activeTab) {
      case 'pt': return this.ptData;
      case 'equipment': return this.equipmentData;
      case 'patron': return this.patronData;
      default: return [];
    }
  }

  getKeys(): string[] {
    const keys = new Set<string>();
    for (const row of this.datosActuales) {
      Object.keys(row ?? {}).forEach((k) => keys.add(k));
    }
    return Array.from(keys);
  }

  formatValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  async nuevoRegistro(): Promise<void> {
    const config = this.getFormConfigForTab();
    if (!config) {
      this.alert.warning('No hay formulario configurado para esta pestaña.');
      return;
    }

    const values = await this.alert.form({
      type: 'question',
      title: config.title,
      message: config.message,
      confirmText: 'Guardar',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Guardar',
        validateOnSubmit: true,
        fields: config.fields,
      },
    });

    if (values === null) return;

    try {
      await this.guardarRegistro(this.activeTab, values);
      this.alert.success('Registro creado correctamente.', 'Éxito');
      this.getDatos();
    } catch (err) {
      console.error('Error al guardar:', err);
      this.alert.error('No se pudo guardar el registro.', 'Error');
    }
  }

  private getFormConfigForTab(): { title: string; message: string; fields: AlertFormField[] } | null {
    switch (this.activeTab) {
      case 'pt':
        return {
          title: 'Nuevo PT',
          message: 'Ingresa los datos del nuevo PT:',
          fields: [
            { name: 'nombre',  label: 'Nombre',          type: 'text',   required: true, minLength: 2 },
            { name: 'codigo',  label: 'Código',          type: 'text',   required: true },
            { name: 'fecha',   label: 'Fecha',           type: 'text',   placeholder: 'YYYY-MM-DD' },
            { name: 'detalle', label: 'Detalle',         type: 'textarea', rows: 3, maxLength: 300 },
            { name: 'activo',  label: 'Activo',          type: 'checkbox', value: true },
          ],
        };

      case 'equipment':
        return {
          title: 'Nuevo Equipo',
          message: 'Ingresa los datos del nuevo equipo:',
          fields: [
            { name: 'nombre',     label: 'Nombre',        type: 'text', required: true },
            { name: 'marca',      label: 'Marca',         type: 'text' },
            { name: 'modelo',     label: 'Modelo',        type: 'text' },
            { name: 'serie',      label: 'Número de serie', type: 'text' },
            { name: 'ubicacion',  label: 'Ubicación',     type: 'text' },
            {
              name: 'estado',
              label: 'Estado',
              type: 'select',
              required: true,
              options: [
                { label: 'Operativo',   value: 'operativo' },
                { label: 'Mantenimiento', value: 'mantenimiento' },
                { label: 'Fuera de servicio', value: 'baja' },
              ],
            },
          ],
        };

      case 'patron':
        return {
          title: 'Nuevo Patrón',
          message: 'Ingresa los datos del nuevo patrón:',
          fields: [
            { name: 'nombre',    label: 'Nombre',         type: 'text', required: true },
            { name: 'codigo',    label: 'Código',         type: 'text', required: true },
            { name: 'valor',     label: 'Valor nominal',  type: 'number' },
            { name: 'unidad',    label: 'Unidad',         type: 'text', placeholder: 'mm, kg, °C…' },
            { name: 'tolerancia',label: 'Tolerancia',     type: 'number' },
            { name: 'notas',     label: 'Notas',          type: 'textarea', rows: 2 },
          ],
        };

      default:
        return null;
    }
  }

  private async guardarRegistro(
    tab: 'pt' | 'equipment' | 'patron',
    values: AlertFormValues
  ): Promise<void> {
    switch (tab) {
      case 'pt':
        // TODO: await this.ptService.crearPt(values);
        console.log('Crear PT con:', values);
        return;

      case 'equipment':
        // TODO: await this.equipmentService.crearEquipo(values);
        console.log('Crear Equipo con:', values);
        return;

      case 'patron':
        // TODO: await this.equipmentService.crearPatron(values);
        console.log('Crear Patrón con:', values);
        return;
    }
  }
}
