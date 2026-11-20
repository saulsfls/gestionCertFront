import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { PtService } from '../../../services/database/external/pt.service';
import { EquipmentService } from '../../../services/database/external/equipment.service';
import { IncertidumbreService } from '../../../services/database/home/incertidumbre.service';
import { AlertService } from '../../../services/core/alert.service';
import { AlertFormField, AlertFormValues } from '../../core/alert/alert.model';
import { CatalogoService } from '../../../services/database/home/catalogo.service';
import {
  TituloCatalogo,
  SubparametroCatalogo,
  MagnitudCatalogo,
  CrearTituloDto,
  CrearSubparametroDto,
  CrearUnidadDto,
} from '../../../models/catalogo.models';

type Tab = 'pt' | 'equipment' | 'patron' | 'titulos' | 'unidades';

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

  // Catálogo
  titulosData: Array<{ id: string } & TituloCatalogo> = [];
  magnitudesData: Array<{ id: string } & MagnitudCatalogo> = [];

  cargando = false;

  activeTab: Tab = 'pt';

  constructor(
    private ptService: PtService,
    private equipmentService: EquipmentService,
    private incService: IncertidumbreService,
    private cdr: ChangeDetectorRef,
    private alert: AlertService,
    public catalogo: CatalogoService   // público para usar en template
  ) {}

  ngOnInit(): void {
    this.getDatos();
    this.getincertidumbreData();
    this.cargarCatalogo();
  }


  // CARGA


  getincertidumbreData(): void {
    this.incService.listar().subscribe({
      next: (res) => {
        console.log('Datos de las incertidumbres:', res);
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

  cargarCatalogo(force = false): void {
    this.cargando = true;
    this.catalogo.cargarCatalogo(force).subscribe({
      next: () => {
        this.refrescarVistasCatalogo();
        this.cargando = false;
        this.cdr.detectChanges();
        console.log(this.catalogo.listaMagnitudes);
      },
      error: (err) => {
        console.error('Error cargando catálogo:', err);
        this.alert.error(
          err?.message ?? 'No se pudo cargar el catálogo.',
          'Error de catálogo'
        );
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });
  }

  private refrescarVistasCatalogo(): void {
    this.titulosData = this.catalogo.listaTitulos();
    this.magnitudesData = this.catalogo.listaMagnitudes();
  }


  // TABLA GENÉRICA (se mantiene igual)


  get datosActuales(): any[] {
    switch (this.activeTab) {
      case 'pt':        return this.ptData;
      case 'equipment': return this.equipmentData;
      case 'patron':    return this.patronData;
      case 'titulos':   return this.titulosData;
      case 'unidades':  return this.magnitudesData;
      default:          return [];
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


  // NUEVO REGISTRO — despacha según tab


  async nuevoRegistro(): Promise<void> {
    switch (this.activeTab) {
      case 'titulos':   return this.crearTituloFlow();
      case 'unidades':  return this.crearUnidadFlow();
      default:          return this.nuevoRegistroGenerico();
    }
  }

  // ── Flujo genérico para pt / equipment / patron (sin cambios) ──
  private async nuevoRegistroGenerico(): Promise<void> {
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
      await this.guardarRegistro(this.activeTab as 'pt' | 'equipment' | 'patron', values);
      this.alert.success('Registro creado correctamente.', 'Éxito');
      this.getDatos();
    } catch (err) {
      console.error('Error al guardar:', err);
      this.alert.error('No se pudo guardar el registro.', 'Error');
    }
  }

  // ── Flujo: crear título ──
  private async crearTituloFlow(): Promise<void> {
    const magnitudes = this.catalogo.listaMagnitudes().map((m) => ({
      label: m.nombre,
      value: m.id,
    }));

    // Añadimos opción "crear nueva magnitud" al select
    magnitudes.push({ label: '＋ Crear nueva magnitud…', value: '__nueva__' });
    // Añadimos el comodín "Other"
    magnitudes.push({ label: 'Comodín (acepta cualquier unidad)', value: '*' });

    const values = await this.alert.form({
      type: 'question',
      title: 'Nuevo título',
      message:
        'El "Nombre visible" es inmutable una vez creado (se guarda en los certificados). ' +
        'El identificador se autogenera desde el nombre.',
      confirmText: 'Crear título',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Crear título',
        validateOnSubmit: true,
        fields: [
          {
            name: 'displayName',
            label: 'Nombre visible (se guarda en el certificado)',
            type: 'text',
            required: true,
            minLength: 3,
            maxLength: 150,
            placeholder: 'ej. Temperature',
          },
          {
            name: 'label',
            label: 'Nombre largo (opcional, solo visual)',
            type: 'text',
            placeholder: 'ej. Temperatura',
          },
          {
            name: 'magnitud',
            label: 'Magnitud física',
            type: 'select',
            required: true,
            options: magnitudes,
          },
          {
            name: 'subparametrosIniciales',
            label: 'Subparámetros iniciales (uno por línea, opcional)',
            type: 'textarea',
            rows: 3,
            placeholder: 'ej.\nTemperature\nTrue Temperature',
          },
        ],
      },
    });

    if (values === null) return;

    // Si el usuario eligió "crear nueva magnitud", pedimos sus datos primero
    let magnitudId = String(values['magnitud'] ?? '').trim();
    if (magnitudId === '__nueva__') {
      const nueva = await this.crearMagnitudFlow();
      if (!nueva) return; // canceló
      magnitudId = nueva;
    }

    const subparametrosIniciales = String(values['subparametrosIniciales'] ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((displayName) => ({ displayName }));

    const dto: CrearTituloDto = {
      displayName: String(values['displayName']).trim(),
      label: String(values['label'] ?? '').trim() || undefined,
      magnitud: magnitudId,
      subparametrosIniciales: subparametrosIniciales.length ? subparametrosIniciales : undefined,
    };

    this.catalogo.crearTitulo(dto).subscribe({
      next: () => {
        this.refrescarVistasCatalogo();
        this.alert.success(`Título "${dto.displayName}" creado.`, 'Éxito');
        this.cdr.detectChanges();
      },
      error: (err) => this.alert.error(err.message, 'Error al crear título'),
    });
  }

  // ── Flujo: crear magnitud nueva (usado desde crearTituloFlow) ──
  private async crearMagnitudFlow(): Promise<string | null> {
    const values = await this.alert.form({
      type: 'question',
      title: 'Nueva magnitud',
      message: 'Crea una magnitud física nueva (ej. temperature, pressure).',
      confirmText: 'Crear magnitud',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Crear magnitud',
        validateOnSubmit: true,
        fields: [
          { name: 'id',     label: 'Identificador (slug)', type: 'text', required: true, placeholder: 'ej. temperature' },
          { name: 'nombre', label: 'Nombre',               type: 'text', required: true, placeholder: 'ej. Temperatura' },
          {
            name: 'unidadesIniciales',
            label: 'Unidades iniciales (una por línea: simbolo|nombre)',
            type: 'textarea',
            rows: 3,
            placeholder: 'ej.\n°C|Celsius\n°F|Fahrenheit\nK|Kelvin',
          },
        ],
      },
    });

    if (values === null) return null;

    const unidadesIniciales = String(values['unidadesIniciales'] ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((linea) => {
        const [simbolo, nombre] = linea.split('|').map((s) => s.trim());
        return { simbolo: simbolo ?? '', nombre: nombre ?? simbolo ?? '' };
      })
      .filter((u) => u.simbolo && u.nombre);

    const id = String(values['id']).trim();

    return new Promise<string | null>((resolve) => {
      this.catalogo.crearMagnitud({
        id,
        nombre: String(values['nombre']).trim(),
        unidadesIniciales: unidadesIniciales.length ? unidadesIniciales : undefined,
      }).subscribe({
        next: () => {
          this.refrescarVistasCatalogo();
          this.alert.success(`Magnitud "${id}" creada.`, 'Éxito');
          resolve(id);
        },
        error: (err) => {
          this.alert.error(err.message, 'Error al crear magnitud');
          resolve(null);
        },
      });
    });
  }

  // ── Flujo: crear unidad (dentro de una magnitud) ──
  private async crearUnidadFlow(): Promise<void> {
    const magnitudes = this.catalogo.listaMagnitudes().map((m) => ({
      label: m.nombre,
      value: m.id,
    }));

    if (magnitudes.length === 0) {
      this.alert.warning('No hay magnitudes en el catálogo. Crea una magnitud primero.');
      return;
    }

    const values = await this.alert.form({
      type: 'question',
      title: 'Nueva unidad',
      message: 'Agrega una unidad nueva a una magnitud existente.',
      confirmText: 'Crear unidad',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'lg',
      form: {
        columns: 1,
        submitText: 'Crear unidad',
        validateOnSubmit: true,
        fields: [
          { name: 'magnitud', label: 'Magnitud', type: 'select', required: true, options: magnitudes },
          { name: 'simbolo',  label: 'Símbolo',  type: 'text', required: true, maxLength: 20, placeholder: 'ej. °C' },
          { name: 'nombre',   label: 'Nombre',   type: 'text', required: true, placeholder: 'ej. Celsius' },
          { name: 'factor',   label: 'Factor (opcional)',  type: 'text', placeholder: '10^0 (Base)' },
          { name: 'prefijo',  label: 'Prefijo (opcional)', type: 'text', placeholder: 'Base' },
        ],
      },
    });

    if (values === null) return;

    const dto: CrearUnidadDto = {
      magnitud: String(values['magnitud']).trim(),
      simbolo:  String(values['simbolo']).trim(),
      nombre:   String(values['nombre']).trim(),
      factor:   String(values['factor'] ?? '').trim() || undefined,
      prefijo:  String(values['prefijo'] ?? '').trim() || undefined,
    };

    this.catalogo.crearUnidad(dto).subscribe({
      next: () => {
        this.refrescarVistasCatalogo();
        this.alert.success(`Unidad "${dto.simbolo}" creada en "${dto.magnitud}".`, 'Éxito');
        this.cdr.detectChanges();
      },
      error: (err) => this.alert.error(err.message, 'Error al crear unidad'),
    });
  }


  // FORM CONFIG (solo para pt / equipment / patron)


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
        console.log('Crear PT con:', values);
        return;

      case 'equipment':
        console.log('Crear Equipo con:', values);
        return;

      case 'patron':
        console.log('Crear Patrón con:', values);
        return;
    }
  }
}
