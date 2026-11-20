import {
  Component,
  OnInit,
  Input,
  ChangeDetectorRef,
  inject,
  PLATFORM_ID
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Certificado, ResultTable, Column } from '../../../models/certificado.models';
import { CertService } from '../../../services/database/home/cert.service';
import { AlertService } from '../../../services/core/alert.service';
import { AuthService } from '../../../services/auth/auth.service';
import { CatalogoService } from '../../../services/database/home/catalogo.service';
import { ImageService } from '../../../services/database/external/image.service';
import {
  ImageCropperComponent,
  ImageCroppedEvent,
  LoadedImage
} from 'ngx-image-cropper';

export type DireccionTab = 'horizontal' | 'vertical';
export type JsonPrimitiveType = 'cadena de texto' | 'numero' | 'boolean';
export type TipoDato = 'number' | 'string';

interface TableImageState {
  imageChangedEvent: Event | null;
  pasteImageFile: File | undefined;
  croppedImageBase64: string;
  cargando: boolean;
  tieneEncabezado: boolean;
}

@Component({
  selector: 'app-editcert',
  standalone: true,
  imports: [FormsModule, CommonModule, ImageCropperComponent],
  templateUrl: './editcert.html',
  styleUrl: './editcert.css',
})
export class Editcert implements OnInit {

  private readonly alert = inject(AlertService);
  private auth = inject(AuthService);
  public catalogo = inject(CatalogoService);
  private imageService = inject(ImageService);
  private platformId = inject(PLATFORM_ID);
  isBrowser: boolean = isPlatformBrowser(this.platformId);

  @Input() id!: string | number;

  /**
   * Campos generales del certificado que NO se pueden editar en esta vista.
   */
  readonly camposBloqueados: ReadonlyArray<keyof Certificado> = [
    'equipment_id',
    'name_equipment',
    'cc',
    'calibration_interval',
    'cert_type',
    'active',
  ];

  certificado: Certificado = {
    equipment_id: '',
    name_equipment: '',
    cc: '',
    date_cal: '',
    date_cc: '',
    calibration_interval: 0,
    resolution: 0,
    entity: '',
    cert_type: '',
    comments: '',
    active: true,
    data: {}
  };

  resultTables: ResultTable[] = [];
  direccionTab: DireccionTab = 'vertical';
  cargando = false;

  jsonInputText = '';

  copiadoExitoso = false;
  guardandoExitoso = false;

  modoEliminarTexto = false;
  columnasParaLimpiar: Set<string> = new Set();

  modoSepararSimbolo = false;
  columnasParaSeparar: Set<string> = new Set();

  // Unidades múltiples por tabla (indexado por table_id)
  unidadesPorTabla: Map<string, Set<string>> = new Map();

  // Estado de imagen por tabla (para OCR)
  imageStates: TableImageState[] = [];
  ocrEnProceso = false;

  private lastTableSeq = 0;
  private guardMostrando = false;
  private salirSinConfirmar = false;

  textoExcel = '';
  excelTarget: { tableIndex: number, columnIndex: number, label: string, key: string, filasActuales: number } | null = null;

  constructor(
    private certificadoService: CertService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Cargar catálogo primero para que títulos/parámetros/unidades estén disponibles
    this.cargarCatalogo().then(() => {
      const certId = this.id || this.route.snapshot.paramMap.get('id');
      if (certId) {
        this.cargarCertificadoPorId(certId);
      } else {
        this.alert.error('No se proporcionó un ID de certificado válido.', 'Error de navegación');
      }
    });
  }

  private cargarCatalogo(): Promise<void> {
    return new Promise((resolve) => {
      this.catalogo.cargarCatalogo().subscribe({
        next: () => resolve(),
        error: (err) => {
          console.error('Error cargando catálogo:', err);
          this.alert.error('No se pudo cargar el catálogo de títulos/unidades.', 'Catálogo');
          resolve();
        }
      });
    });
  }

  estaBloqueado(campo: keyof Certificado): boolean {
    return this.camposBloqueados.includes(campo);
  }

  // ========== CATÁLOGO: getters ==========
  get opcionesTitulo(): string[] {
    return this.catalogo.listaTitulos().map(t => t.displayName);
  }

  obtenerOpcionesParametro(title: string): string[] {
    return this.catalogo.subparametrosDe(title).map(s => s.displayName);
  }

  unidadesDeTabla(table: ResultTable): string[] {
    return this.catalogo.unidadesPara(table.title, table.parameter);
  }

  labelTitulo(table: ResultTable): string {
    if (!table.title) return '';
    const label = this.catalogo.labelDeTitulo(table.title);
    return label && label !== table.title ? label : '';
  }

  labelParametro(table: ResultTable): string {
    if (!table.title || !table.parameter) return '';
    const label = this.catalogo.labelDeSubparametro(table.title, table.parameter);
    return label && label !== table.parameter ? label : '';
  }

  esTituloPredefinido(title: string): boolean {
    return this.catalogo.listaTitulos().some(t => t.displayName === title);
  }

  // ========== SELECCIÓN MÚLTIPLE DE UNIDADES ==========
  unidadesSeleccionadasDe(table: ResultTable): Set<string> {
    const key = table.table_id || '';
    if (!this.unidadesPorTabla.has(key)) {
      // Inicializar desde `table.unit` si ya tenía algo (ej. al cargar el certificado)
      const set = new Set<string>();
      if (table.unit) {
        String(table.unit).split(',').map(s => s.trim()).filter(Boolean).forEach(u => set.add(u));
      }
      this.unidadesPorTabla.set(key, set);
    }
    return this.unidadesPorTabla.get(key)!;
  }

  toggleUnidad(table: ResultTable, unidad: string): void {
    const set = this.unidadesSeleccionadasDe(table);
    if (set.has(unidad)) set.delete(unidad);
    else set.add(unidad);
    this.sincronizarUnitDesdeSeleccion(table);
  }

  unidadesPersonalizadasDe(table: ResultTable): string[] {
    const catalogo = this.unidadesDeTabla(table);
    const set = this.unidadesSeleccionadasDe(table);
    return Array.from(set).filter(u => !catalogo.includes(u));
  }

  agregarUnidadPersonalizada(table: ResultTable, valor: string): void {
    const limpio = (valor || '').trim();
    if (!limpio) return;
    const set = this.unidadesSeleccionadasDe(table);
    set.add(limpio);
    this.sincronizarUnitDesdeSeleccion(table);
  }

  quitarUnidadPersonalizada(table: ResultTable, valor: string): void {
    const set = this.unidadesSeleccionadasDe(table);
    set.delete(valor);
    this.sincronizarUnitDesdeSeleccion(table);
  }

  private sincronizarUnitDesdeSeleccion(table: ResultTable): void {
    const set = this.unidadesSeleccionadasDe(table);
    table.unit = Array.from(set).join(', ');
    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
  }

  private reconstruirUnitsDesdeSets(): void {
    for (const table of this.resultTables) {
      const set = this.unidadesSeleccionadasDe(table);
      table.unit = Array.from(set).join(', ');
    }
  }

  // ========== 🔑 GENERACIÓN / PRESERVACIÓN DE table_id ==========
  private extraerSecuenciaDeId(tableId: string | null | undefined): number | null {
    if (!tableId) return null;
    const m = String(tableId).match(/T(\d+)\s*$/i);
    return m ? parseInt(m[1], 10) : null;
  }

  private regenerarTableIds(): void {
    const folio = (this.certificado.cc || '').trim();
    const equipo = this.certificado.equipment_id || '';

    const mapViejo: Array<{ oldId: string; nuevoId: string }> = [];

    this.resultTables.forEach(t => {
      const n = this.extraerSecuenciaDeId(t.table_id);
      if (n !== null && n > this.lastTableSeq) this.lastTableSeq = n;
    });

    this.resultTables.forEach(t => {
      let seq = this.extraerSecuenciaDeId(t.table_id);
      if (seq === null) {
        this.lastTableSeq++;
        seq = this.lastTableSeq;
      }
      const oldId = t.table_id;
      const nuevoId = folio ? `${folio}-T${seq}` : `T${seq}`;
      if (oldId && oldId !== nuevoId) {
        mapViejo.push({ oldId, nuevoId });
      }
      t.table_id = nuevoId;
      t.cc_id = folio;
      t.equipment_id = equipo;
    });

    // Remapear el Map de unidades
    for (const { oldId, nuevoId } of mapViejo) {
      const set = this.unidadesPorTabla.get(oldId);
      if (set) {
        this.unidadesPorTabla.delete(oldId);
        this.unidadesPorTabla.set(nuevoId, set);
      }
    }
  }

  private nuevoTableIdParaAgregar(): string {
    this.lastTableSeq++;
    const folio = (this.certificado.cc || '').trim();
    return folio ? `${folio}-T${this.lastTableSeq}` : `T${this.lastTableSeq}`;
  }

  // ========== CARGA DEL CERTIFICADO ==========
  cargarCertificadoPorId(id: string | number): void {
    this.cargando = true;
    this.certificadoService.obtenerCertificadoPorId(id).subscribe({
      next: (res: any) => {
        const certData: Certificado = res.data || res;

        this.certificado = {
          ...certData,
          date_cal: certData.date_cal ? this.formatearFechaISO(certData.date_cal) : '',
          date_cc: certData.date_cc ? this.formatearFechaISO(certData.date_cc) : ''
        };

        const rawTables = certData.data?.['Result Tables'] || [];

        this.lastTableSeq = 0;

        if (Array.isArray(rawTables) && rawTables.length > 0) {
          this.resultTables = rawTables.map((table: any) => {
            let min_value = table.min_value ?? null;
            let max_value = table.max_value ?? null;
            const rangeRaw = typeof table.range === 'string' ? table.range.trim() : '';
            if ((min_value === null || max_value === null) && rangeRaw) {
              const parsed = this.parseRangeString(rangeRaw);
              if (min_value === null) min_value = parsed.min;
              if (max_value === null) max_value = parsed.max;
            }

            return {
              title: table.title || '',
              equipment_id: table.equipment_id || this.certificado.equipment_id || '',
              cc_id: table.cc_id || this.certificado.cc || '',
              pt: table.pt || '',
              table_id: table.table_id || '',
              parameter: table.parameter || '',
              unit: table.unit || '',
              min_value,
              max_value,
              range: rangeRaw,
              comments: table.comments || '',
              columns: table.columns || [],
              rows: table.rows || []
            } as ResultTable;
          });

          this.regenerarTableIds();
        } else {
          this.resultTables = [this.crearEstructuraTablaInicial()];
        }

        // Inicializar imageStates y units map
        this.imageStates = this.resultTables.map(() => this.crearEstadoImagenVacio());
        this.unidadesPorTabla.clear();
        for (const table of this.resultTables) {
          if (table.unit) {
            const set = new Set(
              String(table.unit).split(',').map(s => s.trim()).filter(Boolean)
            );
            if (set.size > 0) this.unidadesPorTabla.set(table.table_id, set);
          }
        }
        this.reconstruirUnitsDesdeSets();

        this.sincronizarJsonTexto();
        this.cargando = false;
        this.cdr.detectChanges();

        this.alert.success(
          `Certificado "${this.certificado.cc || id}" cargado correctamente.`,
          'Cargado'
        );
      },
      error: (err: any) => {
        console.error('Error al obtener certificado:', err);
        const msg = err.error?.message || 'Error al obtener la información del certificado.';
        this.alert.error(msg, 'Error al cargar');
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  private formatearFechaISO(fechaStr: string): string {
    if (!fechaStr) return '';
    const date = new Date(fechaStr);
    return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
  }

  private crearEstructuraTablaInicial(): ResultTable {
    const tableId = this.nuevoTableIdParaAgregar();
    const titulos = this.catalogo.listaTitulos();
    const tituloInicial = titulos.length > 0 ? titulos[0].displayName : 'DC Voltage';
    const subs = this.catalogo.subparametrosDe(tituloInicial);
    const paramInicial = subs.length > 0 ? subs[0].displayName : '';
    const unidades = this.catalogo.unidadesPara(tituloInicial, paramInicial);
    const unidadInicial = unidades.length > 0 ? unidades[0] : '';

    return {
      title: tituloInicial,
      equipment_id: this.certificado.equipment_id || '',
      cc_id: this.certificado.cc || '',
      pt: this.certificado.data?.['Result Tables']?.[0]?.pt || '',
      table_id: tableId,
      parameter: paramInicial,
      unit: unidadInicial,
      min_value: null,
      max_value: null,
      range: unidadInicial,
      comments: '',
      columns: [
        { key: 'reading', label: 'Reading', unit: unidadInicial, type: 'number' },
      ],
      rows: [{}]
    };
  }

  private parseRangeString(range: string): { min: number | null; max: number | null } {
    const s = String(range || '').trim();
    if (!s) return { min: null, max: null };

    let m = s.match(/^≥\s*(-?\d+(?:[.,]\d+)?)/);
    if (m) return { min: Number(m[1].replace(',', '.')), max: null };

    m = s.match(/^≤\s*(-?\d+(?:[.,]\d+)?)/);
    if (m) return { min: null, max: Number(m[1].replace(',', '.')) };

    m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*-\s*(-?\d+(?:[.,]\d+)?)/);
    if (m) {
      return {
        min: Number(m[1].replace(',', '.')),
        max: Number(m[2].replace(',', '.')),
      };
    }

    return { min: null, max: null };
  }

  // ========== JSON ==========
  sincronizarJsonTexto(): void {
    this.jsonInputText = this.obtenerJsonString();
  }

  onTableChange(): void {
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
  }

  actualizarParametroSegunTitulo(table: ResultTable): void {
    const opciones = this.obtenerOpcionesParametro(table.title);
    if (opciones.length > 0 && !opciones.includes(table.parameter)) {
      table.parameter = opciones[0];
    }

    const set = this.unidadesSeleccionadasDe(table);
    if (set.size === 0) {
      const unidades = this.catalogo.unidadesPara(table.title, table.parameter);
      if (unidades.length > 0) set.add(unidades[0]);
    } else {
      const unidadesValidas = new Set(this.catalogo.unidadesPara(table.title, table.parameter));
      const nuevas = new Set<string>();
      for (const u of set) {
        if (unidadesValidas.has(u)) nuevas.add(u);
      }
      if (nuevas.size === 0 && unidadesValidas.size > 0) {
        nuevas.add(Array.from(unidadesValidas)[0]);
      }
      this.unidadesPorTabla.set(table.table_id, nuevas);
    }
    this.sincronizarUnitDesdeSeleccion(table);

    this.regenerarTableIds();
    this.sincronizarJsonTexto();
  }

  onParameterChange(table: ResultTable): void {
    const set = this.unidadesSeleccionadasDe(table);
    if (set.size === 0) {
      const unidades = this.catalogo.unidadesPara(table.title, table.parameter);
      if (unidades.length > 0) set.add(unidades[0]);
    } else {
      const unidadesValidas = new Set(this.catalogo.unidadesPara(table.title, table.parameter));
      const nuevas = new Set<string>();
      for (const u of set) {
        if (unidadesValidas.has(u)) nuevas.add(u);
      }
      if (nuevas.size === 0 && unidadesValidas.size > 0) {
        nuevas.add(Array.from(unidadesValidas)[0]);
      }
      this.unidadesPorTabla.set(table.table_id, nuevas);
    }
    this.sincronizarUnitDesdeSeleccion(table);
    this.sincronizarJsonTexto();
  }

  private validarKey(
    key: string,
    table: ResultTable,
    columnaActual?: Column
  ): { valido: boolean; mensaje?: string } {
    const keyLimpio = key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!keyLimpio) {
      return { valido: false, mensaje: 'El key no puede estar vacío.' };
    }
    if (!/^[a-z0-9_]+$/.test(keyLimpio)) {
      return { valido: false, mensaje: 'El key solo puede contener letras minúsculas, números y guión bajo.' };
    }
    for (const col of table.columns) {
      if (columnaActual && col === columnaActual) continue;
      if (col.key === keyLimpio) {
        return { valido: false, mensaje: `El key "${keyLimpio}" ya existe en esta tabla.` };
      }
    }
    return { valido: true };
  }

  actualizarFormularioDesdeJson(): void {
    try {
      const parsedJson = JSON.parse(this.jsonInputText);
      const rawTables = parsedJson['Result Tables'] || parsedJson.resultTables;

      if (!parsedJson || typeof parsedJson !== 'object' || !Array.isArray(rawTables)) {
        throw new Error('El JSON debe contener la propiedad "Result Tables" como un arreglo.');
      }

      const tablasNuevas: ResultTable[] = rawTables.map((t: any, index: number) => {
        if (!Array.isArray(t.columns) || !Array.isArray(t.rows)) {
          throw new Error(`Estructura inválida en la Tabla #${index + 1}. Debe incluir "columns" y "rows".`);
        }

        let min_value = t.min_value ?? null;
        let max_value = t.max_value ?? null;
        const rangeRaw = typeof t.range === 'string' ? t.range.trim() : '';
        if ((min_value === null || max_value === null) && rangeRaw) {
          const parsed = this.parseRangeString(rangeRaw);
          if (min_value === null) min_value = parsed.min;
          if (max_value === null) max_value = parsed.max;
        }

        return {
          title: t.title || '',
          equipment_id: t.equipment_id || this.certificado.equipment_id || '',
          cc_id: t.cc_id || this.certificado.cc || '',
          pt: t.pt || '',
          table_id: t.table_id || '',
          parameter: t.parameter || '',
          unit: t.unit || '',
          min_value,
          max_value,
          range: rangeRaw,
          comments: t.comments || '',
          columns: t.columns,
          rows: t.rows,
        } as ResultTable;
      });

      if (tablasNuevas.length === 0) {
        throw new Error('Debe incluir al menos una tabla de resultados en el JSON.');
      }

      this.resultTables = tablasNuevas;
      this.imageStates = tablasNuevas.map(() => this.crearEstadoImagenVacio());
      this.regenerarTableIds();

      this.unidadesPorTabla.clear();
      for (const table of this.resultTables) {
        if (table.unit) {
          const set = new Set(
            String(table.unit).split(',').map(s => s.trim()).filter(Boolean)
          );
          if (set.size > 0) this.unidadesPorTabla.set(table.table_id, set);
        }
      }
      this.reconstruirUnitsDesdeSets();

      this.sincronizarJsonTexto();
      this.cdr.detectChanges();

      this.alert.success('Las tablas han sido actualizadas desde el JSON.', 'JSON aplicado');
    } catch (err: any) {
      this.alert.error(err?.message ?? 'JSON inválido', 'Error al parsear JSON');
    }
  }

  // ========== NAVEGACIÓN TAB ==========
  onTabKeydown(event: Event, tableIndex: number, rowIndex: number, colIndex: number): void {
    if (this.direccionTab === 'horizontal') return;
    const keyEvent = event as KeyboardEvent;
    keyEvent.preventDefault();
    const direction = keyEvent.shiftKey ? -1 : 1;
    const siguienteFilaIndex = rowIndex + direction;
    const targetId = `input-${tableIndex}-${siguienteFilaIndex}-${colIndex}`;
    const targetInput = document.getElementById(targetId) as HTMLInputElement;
    if (targetInput) {
      targetInput.focus();
      targetInput.select();
    }
  }

  // ========== GESTIÓN DE TABLAS ==========
  agregarTabla(): void {
    const nueva = this.crearEstructuraTablaInicial();
    this.resultTables.push(nueva);
    this.imageStates.push(this.crearEstadoImagenVacio());
    if (nueva.unit) {
      this.unidadesPorTabla.set(nueva.table_id, new Set([nueva.unit]));
    }
    this.sincronizarJsonTexto();
    this.alert.info(`Tabla #${this.resultTables.length} agregada.`, 'Nueva tabla');
  }

  eliminarTabla(indexTable: number): void {
    if (this.resultTables.length > 1) {
      const eliminada = this.resultTables[indexTable];
      this.unidadesPorTabla.delete(eliminada.table_id);

      this.resultTables.splice(indexTable, 1);
      this.imageStates.splice(indexTable, 1);

      // Reindexar selecciones de columnas
      const nuevasSelecciones = new Set<string>();
      this.columnasParaLimpiar.forEach(id => {
        const [tIdx, cIdx] = id.split('-').map(Number);
        if (tIdx < indexTable) nuevasSelecciones.add(id);
        else if (tIdx > indexTable) nuevasSelecciones.add(`${tIdx - 1}-${cIdx}`);
      });
      this.columnasParaLimpiar = nuevasSelecciones;

      const nuevasSeparaciones = new Set<string>();
      this.columnasParaSeparar.forEach(id => {
        const [tIdx, cIdx] = id.split('-').map(Number);
        if (tIdx < indexTable) nuevasSeparaciones.add(id);
        else if (tIdx > indexTable) nuevasSeparaciones.add(`${tIdx - 1}-${cIdx}`);
      });
      this.columnasParaSeparar = nuevasSeparaciones;

      this.regenerarTableIds();
      this.sincronizarJsonTexto();
      this.alert.warning(`Tabla #${indexTable + 1} eliminada.`, 'Tabla eliminada');
    }
  }

  // ========== GESTIÓN DE COLUMNAS ==========
  agregarColumna(table: ResultTable): void {
    const id = table.columns.length + 1;
    const nuevaKey = `column_${id}`;
    table.columns.push({
      key: nuevaKey,
      label: `New Column ${id}`,
      unit: '',
      type: 'number'
    });
    table.rows.forEach(row => {
      row[nuevaKey] = null;
    });
    this.sincronizarJsonTexto();
  }

  eliminarColumna(table: ResultTable, indexColumn: number): void {
    if (table.columns.length <= 1) return;
    const keyAEliminar = table.columns[indexColumn].key;
    table.columns.splice(indexColumn, 1);
    table.rows.forEach(row => {
      delete row[keyAEliminar];
    });
    this.sincronizarJsonTexto();
  }

  actualizarKeyColumna(col: Column, nuevaKeyRaw: string, table: ResultTable): void {
    const nuevaKey = nuevaKeyRaw.trim().toLowerCase().replace(/\s+/g, '_');
    const viejaKey = col.key;
    if (!nuevaKey || nuevaKey === viejaKey) return;

    const resultado = this.validarKey(nuevaKey, table, col);
    if (!resultado.valido) {
      this.alert.error(resultado.mensaje ?? 'Key inválido', 'Key inválido');
      col.key = viejaKey;
      this.cdr.detectChanges();
      return;
    }

    col.key = nuevaKey;
    table.rows.forEach(row => {
      row[nuevaKey] = row[viejaKey] ?? null;
      delete row[viejaKey];
    });
    this.sincronizarJsonTexto();
  }

  cambiarTipoDato(col: Column, table: ResultTable): void {
    table.rows.forEach(row => {
      row[col.key] = null;
    });
    this.sincronizarJsonTexto();
  }

  // ========== CARGA DESDE EXCEL ==========
  async abrirCargaExcel(tableIndex: number, columnIndex: number): Promise<void> {
    const table = this.resultTables[tableIndex];
    if (!table) return;
    const col = table.columns[columnIndex];
    if (!col) return;

    const filasActuales = table.rows.length;

    const values = await this.alert.form({
      title: 'Carga desde Excel',
      message: `Pega los datos para la columna <b>"${col.label}"</b>.<br><small class="text-muted">La columna tiene ${filasActuales} fila(s). La primera línea debe ser el encabezado.</small>`,
      type: 'info',
      confirmText: 'Procesar datos',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'md',
      form: {
        columns: 1,
        submitText: 'Procesar',
        validateOnSubmit: true,
        fields: [
          {
            name: 'textoExcel',
            label: 'Datos de Excel',
            type: 'textarea',
            rows: 10,
            required: true,
            placeholder: 'Encabezado\nDato 1\nDato 2\nDato 3...',
          }
        ]
      }
    });

    if (values === null) return;

    const texto = String(values['textoExcel'] ?? '').trim();

    if (!texto) {
      this.alert.warning('No se recibió ningún texto para procesar.', 'Sin datos');
      return;
    }

    this.aplicarDatosExcel(table, col, texto);
  }

  private aplicarDatosExcel(
    table: ResultTable,
    col: Column,
    textoRaw: string
  ): void {
    const lineas = textoRaw
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l !== '');

    if (lineas.length === 0) {
      this.alert.warning('No se encontraron líneas válidas.', 'Sin datos');
      return;
    }

    const encabezado = lineas[0];
    const datos = lineas.slice(1);

    const filasActuales = table.rows.length;

    if (datos.length === 0) {
      this.alert.warning(
        'Solo se recibió el encabezado, no hay datos para cargar.',
        'Sin datos'
      );
      return;
    }

    if (datos.length > filasActuales) {
      this.alert.error(
        `El número de filas no coincide: recibiste ${datos.length} dato(s) ` +
        `pero la columna solo tiene ${filasActuales} fila(s). ` +
        `Recorta los datos o agrega más filas antes de volver a intentar.`,
        'Filas no coinciden'
      );
      return;
    }

    const convertir = (v: string): any => {
      if (col.type === 'number') {
        return this.extraerNumeroDeTexto(v);
      }
      return v;
    };

    table.rows.forEach((row, idx) => {
      if (idx < datos.length) {
        row[col.key] = convertir(datos[idx]);
      }
    });

    if (encabezado && encabezado !== col.label) {
      col.label = encabezado;
    }

    this.sincronizarJsonTexto();
    this.cdr.detectChanges();

    this.alert.success(
      `Se cargaron ${datos.length} dato(s) en la columna "${col.label}". ` +
      `Encabezado: "${encabezado}".`,
      'Datos cargados'
    );
  }

  // ============================================================
  // MODO 1: ELIMINAR TEXTO
  // ============================================================
  toggleModoEliminarTexto(): void {
    this.modoEliminarTexto = !this.modoEliminarTexto;
    if (this.modoEliminarTexto) {
      this.modoSepararSimbolo = false;
      this.columnasParaSeparar.clear();
    } else {
      this.columnasParaLimpiar.clear();
    }
    this.cdr.detectChanges();
  }

  esColumnaSeleccionada(tableIndex: number, colIndex: number): boolean {
    return this.columnasParaLimpiar.has(`${tableIndex}-${colIndex}`);
  }

  toggleColumnaLimpiar(tableIndex: number, colIndex: number): void {
    const id = `${tableIndex}-${colIndex}`;
    if (this.columnasParaLimpiar.has(id)) {
      this.columnasParaLimpiar.delete(id);
    } else {
      this.columnasParaLimpiar.add(id);
    }
    this.cdr.detectChanges();
  }

  private extraerNumeroDeTexto(valor: any): number | null {
    if (valor === null || valor === undefined) return null;
    if (typeof valor === 'number') return isNaN(valor) ? null : valor;

    let str = String(valor).trim();
    if (str === '') return null;

    str = str.replace(/,/g, '.');

    const match = str.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) return null;

    const num = Number(match[0]);
    return isNaN(num) ? null : num;
  }

  formatearTexto(): void {
    if (this.columnasParaLimpiar.size === 0) {
      this.alert.warning('Seleccione al menos una columna para formatear.', 'Sin columnas');
      return;
    }

    let valoresLimpiados = 0;

    this.resultTables.forEach((table, tableIndex) => {
      table.columns.forEach((col, colIndex) => {
        if (!this.columnasParaLimpiar.has(`${tableIndex}-${colIndex}`)) return;

        col.type = 'number';

        table.rows.forEach(row => {
          const original = row[col.key];
          if (original === null || original === undefined || original === '') return;

          const numero = this.extraerNumeroDeTexto(original);
          if (numero !== null) {
            row[col.key] = numero;
            valoresLimpiados++;
          }
        });
      });
    });

    this.sincronizarJsonTexto();
    this.modoEliminarTexto = false;
    this.columnasParaLimpiar.clear();
    this.cdr.detectChanges();

    if (valoresLimpiados === 0) {
      this.alert.warning(
        'No se encontraron valores numéricos para formatear en las columnas seleccionadas.',
        'Sin cambios'
      );
    } else {
      this.alert.success(
        `Se limpiaron ${valoresLimpiados} valor${valoresLimpiados === 1 ? '' : 'es'} correctamente.`,
        'Formato aplicado'
      );
    }
  }

  // ============================================================
  // MODO 2: SEPARAR SÍMBOLO "±"
  // ============================================================
  toggleModoSepararSimbolo(): void {
    this.modoSepararSimbolo = !this.modoSepararSimbolo;
    if (this.modoSepararSimbolo) {
      this.modoEliminarTexto = false;
      this.columnasParaLimpiar.clear();
    } else {
      this.columnasParaSeparar.clear();
    }
    this.cdr.detectChanges();
  }

  esColumnaParaSeparar(tableIndex: number, colIndex: number): boolean {
    return this.columnasParaSeparar.has(`${tableIndex}-${colIndex}`);
  }

  toggleColumnaParaSeparar(tableIndex: number, colIndex: number): void {
    const id = `${tableIndex}-${colIndex}`;
    if (this.columnasParaSeparar.has(id)) {
      this.columnasParaSeparar.delete(id);
    } else {
      this.columnasParaSeparar.add(id);
    }
    this.cdr.detectChanges();
  }

  private generarKeyUnica(table: ResultTable, keyBase: string): string {
    const existentes = new Set(table.columns.map(c => c.key));
    if (!existentes.has(keyBase)) return keyBase;
    let sufijo = 1;
    let candidato = `${keyBase}_${sufijo}`;
    while (existentes.has(candidato)) {
      sufijo++;
      candidato = `${keyBase}_${sufijo}`;
    }
    return candidato;
  }

  separarColumnas(): void {
    if (this.columnasParaSeparar.size === 0) {
      this.alert.warning('Selecciona al menos una columna para separar.', 'Sin columnas');
      return;
    }

    let columnasProcesadas = 0;
    let valoresConSimbolo = 0;
    let columnasSinSimbolo = 0;

    const seleccionadas = Array.from(this.columnasParaSeparar)
      .map(id => {
        const [tIdx, cIdx] = id.split('-').map(Number);
        return { tIdx, cIdx };
      })
      .sort((a, b) => {
        if (a.tIdx !== b.tIdx) return b.tIdx - a.tIdx;
        return b.cIdx - a.cIdx;
      });

    for (const { tIdx, cIdx } of seleccionadas) {
      const table = this.resultTables[tIdx];
      if (!table) continue;
      const colOriginal = table.columns[cIdx];
      if (!colOriginal) continue;

      let conSimbolo = 0;
      const valoresSeparados: Array<{ a: number | null; b: number | null }> = [];

      table.rows.forEach(row => {
        const valor = row[colOriginal.key];
        if (valor === null || valor === undefined || String(valor).trim() === '') {
          valoresSeparados.push({ a: null, b: null });
          return;
        }
        const str = String(valor);
        if (str.includes('±')) {
          const partes = str.split('±');
          const a = this.extraerNumeroDeTexto(partes[0]);
          const b = this.extraerNumeroDeTexto(partes[1]);
          valoresSeparados.push({ a, b });
          conSimbolo++;
        } else {
          const a = this.extraerNumeroDeTexto(str);
          valoresSeparados.push({ a, b: null });
        }
      });

      if (conSimbolo === 0) {
        columnasSinSimbolo++;
        continue;
      }

      const key1 = this.generarKeyUnica(table, 'error_relativo');
      const existentesParaKey2 = new Set(table.columns.map(c => c.key));
      existentesParaKey2.add(key1);
      let key2 = 'incertidumbre';
      if (existentesParaKey2.has(key2)) {
        let sufijo = 1;
        let candidato = `${key2}_${sufijo}`;
        while (existentesParaKey2.has(candidato)) {
          sufijo++;
          candidato = `${key2}_${sufijo}`;
        }
        key2 = candidato;
      }

      const col1: Column = {
        key: key1,
        label: 'Error Relativo',
        unit: colOriginal.unit,
        type: 'number'
      };
      const col2: Column = {
        key: key2,
        label: 'Incertidumbre',
        unit: colOriginal.unit,
        type: 'number'
      };

      table.rows.forEach((row, idx) => {
        const { a, b } = valoresSeparados[idx];
        row[key1] = a;
        row[key2] = b;
        delete row[colOriginal.key];
      });

      table.columns.splice(cIdx, 1, col1, col2);

      columnasProcesadas++;
      valoresConSimbolo += conSimbolo;
    }

    this.columnasParaSeparar.clear();
    this.modoSepararSimbolo = false;
    this.sincronizarJsonTexto();
    this.cdr.detectChanges();

    if (columnasProcesadas === 0) {
      this.alert.error(
        'Ninguna de las columnas seleccionadas contiene el símbolo "±".',
        'No se puede separar'
      );
      return;
    }

    let mensaje = `Se separaron ${columnasProcesadas} columna${columnasProcesadas === 1 ? '' : 's'} (${valoresConSimbolo} valor${valoresConSimbolo === 1 ? '' : 'es'} con "±" procesado${valoresConSimbolo === 1 ? '' : 's'}).`;
    if (columnasSinSimbolo > 0) {
      mensaje += ` ${columnasSinSimbolo} columna${columnasSinSimbolo === 1 ? '' : 's'} sin "±" fue${columnasSinSimbolo === 1 ? '' : 'ron'} omitida${columnasSinSimbolo === 1 ? '' : 's'}.`;
    }

    this.alert.success(mensaje, 'Separación completa');
  }

  // ========== GESTIÓN DE FILAS ==========
  agregarFila(table: ResultTable): void {
    const nuevaFila: Record<string, any> = {};
    table.columns.forEach(col => {
      nuevaFila[col.key] = null;
    });
    table.rows.push(nuevaFila);
    this.sincronizarJsonTexto();
  }

  eliminarFila(table: ResultTable, indexRow: number): void {
    if (table.rows.length > 1) {
      table.rows.splice(indexRow, 1);
      this.sincronizarJsonTexto();
    }
  }

  // ========== ESTADO DE IMAGEN ==========
  private crearEstadoImagenVacio(): TableImageState {
    return {
      imageChangedEvent: null, pasteImageFile: undefined, croppedImageBase64: '',
      cargando: false, tieneEncabezado: true
    };
  }

  // ========== MÉTODOS DE IMAGEN / OCR ==========
  onPaste(event: ClipboardEvent, tableIndex: number): void {
    if (!this.isBrowser) return;
    const state = this.imageStates[tableIndex];
    if (!state) return;
    const items = event.clipboardData?.items;
    if (!items) return;

    let imagenEncontrada = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          state.imageChangedEvent = null;
          state.croppedImageBase64 = '';
          state.pasteImageFile = new File([file], `pasted_image_${Date.now()}.png`, { type: file.type });
          this.cdr.detectChanges();
          imagenEncontrada = true;
        }
        break;
      }
    }
    if (!imagenEncontrada) this.alert.warning('El contenido pegado no es una imagen válida.');
  }

  fileChangeEvent(event: Event, tableIndex: number): void {
    const state = this.imageStates[tableIndex];
    if (!state) return;
    state.pasteImageFile = undefined;
    state.croppedImageBase64 = '';
    state.imageChangedEvent = event;
  }

  imageCropped(event: ImageCroppedEvent, tableIndex: number): void {
    const state = this.imageStates[tableIndex];
    if (!state) return;
    if (event.base64) {
      state.croppedImageBase64 = event.base64;
    } else if (event.objectUrl && this.isBrowser) {
      this.blobToBase64(event.objectUrl).then(base64 => {
        state.croppedImageBase64 = base64;
        this.cdr.detectChanges();
      });
    }
  }

  imageLoaded(_image?: LoadedImage): void { this.cdr.detectChanges(); }
  cropperReady(): void { /* listo */ }
  loadImageFailed(_tableIndex?: number): void { this.alert.error('Error al cargar la imagen. Intenta con otra captura o archivo.'); }

  cancelarImagen(tableIndex: number): void {
    const state = this.imageStates[tableIndex];
    if (!state) return;
    state.imageChangedEvent = null;
    state.pasteImageFile = undefined;
    state.croppedImageBase64 = '';
    state.cargando = false;
    this.cdr.detectChanges();
  }

  private blobToBase64(blobUrl: string): Promise<string> {
    if (!this.isBrowser) return Promise.resolve('');
    return fetch(blobUrl).then(r => r.blob()).then(
      blob => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      })
    );
  }

  enviarANode(tableIndex: number): void {
    const state = this.imageStates[tableIndex];
    const table = this.resultTables[tableIndex];
    if (!state || !table) return;

    if (this.ocrEnProceso || state.cargando) {
      this.alert.info('Ya hay un proceso de extracción en curso.');
      return;
    }
    if (!state.pasteImageFile && !state.imageChangedEvent) {
      this.alert.warning('Por favor selecciona o pega una imagen primero.');
      return;
    }
    if (!state.croppedImageBase64) {
      this.alert.warning('Ajusta el área de selección sobre la tabla antes de extraer.');
      return;
    }

    this.ocrEnProceso = true;
    state.cargando = true;
    this.cdr.detectChanges();

    const terminar = () => {
      this.ocrEnProceso = false;
      state.cargando = false;
      try { this.cdr.detectChanges(); } catch { /* noop */ }
    };

    this.imageService.procesarTabla(state.croppedImageBase64).subscribe({
      next: (res: any) => {
        try {
          if (res?.success && res?.table) {
            const tableText = String(res.table).trim();
            let headers: string[] = [];
            let rows: string[][] = [];

            if (tableText.startsWith('<table')) {
              const parsed = this.parseTableHtml(tableText);
              headers = parsed.headers;
              rows = parsed.rows;
            } else {
              const parsed = this.parseTableText(tableText);
              headers = parsed.headers;
              rows = parsed.rows;
            }

            if (headers.length > 0 && rows.length > 0) {
              this.aplicarDatosExtraidos(tableIndex, headers, rows, state.tieneEncabezado);
              this.alert.confirm(
                'La AI puede cometer errores. Verifica los valores extraídos antes de continuar.',
                '⚠ Revisa los datos',
                { type: 'warning', confirmText: 'Entendido, los reviso', cancelText: 'Cerrar', dismissible: false }
              ).then(revisar => {
                if (revisar) this.alert.success('Los datos se vaciaron correctamente.', 'OCR completado');
                else this.alert.info('Puedes revisar los datos antes de guardar.');
              });
            } else {
              this.alert.error('No se pudo extraer una tabla válida de la imagen.', 'OCR');
            }
          } else {
            this.alert.error('No se pudo extraer la tabla.', 'OCR');
          }
        } catch (e) {
          console.error('Error procesando la respuesta:', e);
          this.alert.error('Error al procesar la respuesta del servidor.', 'Error OCR');
        } finally {
          terminar();
        }
      },
      error: (err: any) => {
        console.error('Error en servidor:', err);
        this.alert.error('Ocurrió un error al procesar la tabla en el servidor.', 'Error OCR');
        terminar();
      },
      complete: () => terminar()
    });
  }

  // ========== NOTACIÓN CIENTÍFICA ==========
  private expandirNotacionCientifica(raw: string): string {
    let s = String(raw ?? '').trim();
    if (!s) return '';

    if (/^-?\d+,\d+(?:[eE][+-]?\d+)?$/.test(s)) s = s.replace(',', '.');
    if (!/[eE]/.test(s)) return s;

    const num = Number(s);
    if (isNaN(num) || !isFinite(num)) return s;

    let resultado = num.toLocaleString('en-US', {
      useGrouping: false,
      maximumSignificantDigits: 21
    });

    if (/[eE]/.test(resultado)) {
      const str = num.toString();
      const m = str.match(/^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
      if (m) {
        const signo = m[1];
        const entero = m[2];
        const decimales = m[3] || '';
        const exp = parseInt(m[4], 10);
        const digitos = entero + decimales;
        const puntoPos = entero.length + exp;
        if (puntoPos <= 0) resultado = signo + '0.' + '0'.repeat(-puntoPos) + digitos;
        else if (puntoPos >= digitos.length) resultado = signo + digitos + '0'.repeat(puntoPos - digitos.length);
        else resultado = signo + digitos.slice(0, puntoPos) + '.' + digitos.slice(puntoPos);
      }
    }
    return resultado;
  }

  // ========== PARSEADOR DE TEXTO ==========
  private parseTableText(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 1) return { headers: [], rows: [] };

    const normalizedLines = lines.map(line => {
      if (line.includes('\t')) return line.replace(/\t/g, ' | ');
      if (line.includes(';')) return line.replace(/;/g, ' | ');
      if (line.includes('|') && !line.includes(' | ')) return line.replace(/\|/g, ' | ');
      if (line.match(/\s{2,}/)) return line.replace(/\s{2,}/g, ' | ');
      return line;
    });

    const separator = ' | ';
    const headers = normalizedLines[0].split(separator).map(h => h.trim()).filter(h => h.length > 0);
    if (headers.length === 0) return { headers: [], rows: [] };

    const rows: string[][] = [];
    for (let i = 1; i < normalizedLines.length; i++) {
      let cells = normalizedLines[i].split(separator).map(c => c.trim());
      while (cells.length < headers.length) cells.push('');
      if (cells.length > headers.length) cells = cells.slice(0, headers.length);
      rows.push(cells);
    }
    return { headers, rows };
  }

  // ========== PARSEADOR DE HTML ==========
  private parseTableHtml(html: string): { headers: string[]; rows: string[][] } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tables = doc.querySelectorAll('table');
    if (tables.length === 0) return { headers: [], rows: [] };

    const table = tables[0];
    const allRows = table.querySelectorAll('tr');
    if (allRows.length === 0) return { headers: [], rows: [] };

    const isHeaderRow = (row: Element): boolean => {
      const cells = row.querySelectorAll('th, td');
      let textCells = 0;
      cells.forEach(cell => {
        const text = cell.textContent?.trim() || '';
        if (text === '') return;
        if (/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(text)) textCells++;
      });
      return cells.length > 0 && (textCells / cells.length) > 0.5;
    };

    let headerRowIndex = 0;
    let dataStartIndex = 1;
    let foundHeader = false;

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      if (row.querySelector('th') !== null) { headerRowIndex = i; dataStartIndex = i + 1; foundHeader = true; break; }
      if (isHeaderRow(row)) { headerRowIndex = i; dataStartIndex = i + 1; foundHeader = true; break; }
    }

    if (!foundHeader) { headerRowIndex = 0; dataStartIndex = 1; }

    const headerRow = allRows[headerRowIndex];
    const headerCells = headerRow.querySelectorAll('th, td');

    const headers: string[] = [];
    headerCells.forEach(cell => {
      const text = cell.textContent?.trim() || '';
      const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
      if (text === '') { for (let c = 1; c < colspan; c++) headers.push(''); return; }
      headers.push(text);
      for (let c = 1; c < colspan; c++) headers.push(text);
    });

    if (headers.length === 0) return { headers: [], rows: [] };

    const dataRows = Array.from(allRows).slice(dataStartIndex);
    const rows: string[][] = [];
    const activeRowspan: { [col: number]: { value: string; remaining: number } } = {};

    dataRows.forEach(row => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      const rowData: string[] = new Array(headers.length).fill('');

      for (let col = 0; col < headers.length; col++) {
        if (activeRowspan[col] && activeRowspan[col].remaining > 0) {
          rowData[col] = activeRowspan[col].value;
          activeRowspan[col].remaining--;
          if (activeRowspan[col].remaining === 0) delete activeRowspan[col];
        }
      }

      let cellIndex = 0;
      for (let col = 0; col < headers.length; col++) {
        if (rowData[col] !== '') continue;
        while (cellIndex < cells.length) {
          const cell = cells[cellIndex];
          const value = cell.textContent?.trim() || '';
          const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10);
          const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
          if (value === '' && rowspan <= 1 && colspan <= 1) { cellIndex++; continue; }
          rowData[col] = value;
          if (rowspan > 1) activeRowspan[col] = { value, remaining: rowspan - 1 };
          for (let c = 1; c < colspan; c++) { if (col + c < headers.length) rowData[col + c] = value; }
          cellIndex++;
          break;
        }
      }

      const tieneAlgunValor = rowData.some(v => v !== '');
      if (!tieneAlgunValor) return;
      rows.push(rowData);
    });

    const lastValues: string[] = new Array(headers.length).fill('');
    const finalRows: string[][] = rows.map(row => {
      const newRow: string[] = [];
      for (let col = 0; col < headers.length; col++) {
        let val = row[col];
        if (val === '' && lastValues[col] !== '') val = lastValues[col];
        newRow.push(val);
        if (val !== '') lastValues[col] = val;
      }
      return newRow;
    });

    return { headers, rows: finalRows };
  }

  private aplicarDatosExtraidos(indexTable: number, headers: string[], rows: string[][], tieneEncabezado: boolean): void {
    const table = this.resultTables[indexTable];
    if (!table) return;

    let headersEfectivos: string[];
    let filasEfectivas: string[][];

    if (tieneEncabezado) {
      headersEfectivos = headers;
      filasEfectivas = rows;
    } else {
      headersEfectivos = headers.map((_, idx) => `col_${idx + 1}`);
      filasEfectivas = [headers.slice(), ...rows];
    }

    const rowsProcesadas: string[][] = filasEfectivas.map(row =>
      row.map(celda => this.expandirNotacionCientifica(celda))
    );

    const usedKeys = new Set<string>();
    const newColumns: Column[] = headersEfectivos.map((header, idx) => {
      const baseKey = (header || '').trim().toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `column_${idx + 1}`;

      let key = baseKey;
      let counter = 1;
      while (usedKeys.has(key)) key = `${baseKey}_${counter++}`;
      usedKeys.add(key);

      let type: TipoDato = 'string';
      for (const row of rowsProcesadas) {
        const raw = row[idx];
        if (raw === undefined || raw === null || String(raw).trim() === '') continue;
        if (this.esNumeroValido(String(raw))) type = 'number';
        break;
      }
      return { key, label: header || `Col ${idx + 1}`, unit: '', type };
    });

    const newRows = rowsProcesadas.map(row => {
      const obj: Record<string, any> = {};
      newColumns.forEach((col, idx) => {
        const raw = row[idx];
        if (col.type === 'number') {
          if (raw === undefined || raw === null || String(raw).trim() === '') obj[col.key] = null;
          else {
            const s = String(raw).trim().replace(',', '.');
            const num = Number(s);
            obj[col.key] = isNaN(num) || !isFinite(num) ? null : num;
          }
        } else {
          obj[col.key] = raw !== undefined && raw !== null && String(raw) !== '' ? String(raw) : null;
        }
      });
      return obj;
    });

    table.columns = newColumns;
    table.rows = newRows.length > 0 ? newRows : [{}];
    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
  }

  // ========== VALIDADORES NUMÉRICOS ==========
  esNumeroValido(s: string): boolean {
    const t = (s ?? '').trim();
    if (!t) return false;
    return /^-?(?:\d+[.,]?\d*|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(t);
  }

  esValorInvalido(valor: any, col: Column): boolean {
    if (col.type !== 'number') return false;
    if (valor === null || valor === undefined) return false;
    if (typeof valor === 'number') return !isFinite(valor);
    if (String(valor).trim() === '') return false;
    return !this.esNumeroValido(String(valor));
  }

  // ========== CONSTRUCCIÓN DEL JSON ==========
  obtenerJsonEstructurado(): object {
    this.regenerarTableIds();

    const tablasProcesadas = this.resultTables.map(table => {
      const tiposPorKey: Record<string, TipoDato> = {};
      table.columns.forEach(col => {
        tiposPorKey[col.key] = col.type;
      });

      const filasProcesadas = table.rows.map(row => {
        const nuevaFila: Record<string, any> = {};
        Object.keys(row).forEach(key => {
          const valorRaw = row[key];
          const esNumero = tiposPorKey[key] === 'number';
          if (esNumero) {
            if (valorRaw === null || valorRaw === undefined || valorRaw === '') {
              nuevaFila[key] = null;
            } else {
              const numVal = Number(valorRaw);
              nuevaFila[key] = isNaN(numVal) ? null : numVal;
            }
          } else {
            nuevaFila[key] = valorRaw !== null && valorRaw !== undefined ? String(valorRaw) : null;
          }
        });
        return nuevaFila;
      });

      const set = this.unidadesPorTabla.get(table.table_id);
      const unitFinal = set ? Array.from(set).join(', ') : (table.unit || '');

      return {
        table_id: table.table_id,
        cc_id: this.certificado.cc || '',
        pt: table.pt || '',
        title: table.title || '',
        equipment_id: this.certificado.equipment_id,
        parameter: table.parameter || '',
        unit: unitFinal,
        range: unitFinal,
        min_value: table.min_value ?? null,
        max_value: table.max_value ?? null,
        comments: table.comments || '',
        columns: table.columns,
        rows: filasProcesadas
      };
    });

    return { 'Result Tables': tablasProcesadas };
  }

  obtenerJsonString(): string {
    return JSON.stringify(this.obtenerJsonEstructurado(), null, 2);
  }

  copiarJson(): void {
    navigator.clipboard.writeText(this.jsonInputText).then(() => {
      this.copiadoExitoso = true;
      this.alert.success('JSON copiado al portapapeles.');
      setTimeout(() => {
        this.copiadoExitoso = false;
        this.cdr.detectChanges();
      }, 2500);
    });
  }

  // ========== VALIDACIONES ==========
  validarFormulario(): boolean {
    if (!this.certificado.equipment_id || !this.certificado.equipment_id.trim()) {
      this.alert.warning('El "ID del Equipo" es un campo obligatorio.', 'Campo requerido');
      return false;
    }
    if (!this.certificado.name_equipment || !this.certificado.name_equipment.trim()) {
      this.alert.warning('El "Nombre del Equipo" es un campo obligatorio.', 'Campo requerido');
      return false;
    }
    if (!this.certificado.cc || !this.certificado.cc.trim()) {
      this.alert.warning('El "Folio del Certificado (cc)" es un campo obligatorio.', 'Campo requerido');
      return false;
    }
    if (this.certificado.date_cal && this.certificado.date_cc) {
      const fechaCal = new Date(this.certificado.date_cal);
      const fechaCc = new Date(this.certificado.date_cc);
      if (fechaCc < fechaCal) {
        this.alert.warning(
          'La "Fecha del Certificado" no puede ser anterior a la "Fecha de Calibración".',
          'Fechas inválidas'
        );
        return false;
      }
    }

    for (let i = 0; i < this.resultTables.length; i++) {
      const table = this.resultTables[i];
      const numTable = i + 1;

      if (!table.title || !table.title.trim()) {
        this.alert.warning(`El título de la Tabla #${numTable} es obligatorio.`);
        return false;
      }
      if (!table.parameter || !table.parameter.trim()) {
        this.alert.warning(`El parámetro de la Tabla #${numTable} es obligatorio.`);
        return false;
      }
      if (!table.table_id) {
        this.regenerarTableIds();
        if (!table.table_id) {
          this.alert.error(`No se pudo generar el ID de la Tabla #${numTable}.`);
          return false;
        }
      }

      const keys = table.columns.map(col => col.key.trim().toLowerCase().replace(/\s+/g, '_'));
      const uniqueKeys = new Set(keys);
      if (keys.length !== uniqueKeys.size) {
        this.alert.error(`La Tabla #${numTable} tiene columnas con keys duplicados.`, 'Keys duplicados');
        return false;
      }
      for (const col of table.columns) {
        const keyLimpio = col.key.trim().toLowerCase().replace(/\s+/g, '_');
        if (!keyLimpio) {
          this.alert.error(`La Tabla #${numTable} tiene una columna con key vacío.`);
          return false;
        }
        if (!/^[a-z0-9_]+$/.test(keyLimpio)) {
          this.alert.error(
            `La Tabla #${numTable} tiene un key con caracteres no permitidos: "${col.key}".`
          );
          return false;
        }
      }
    }
    return true;
  }

  guardarCertificado(): void {
    if (this.cargando) return;
    if (!this.validarFormulario()) return;
    const user = this.auth.getUser();
    if (!user) {
      this.alert.error(
        'Debes iniciar sesión para actualizar un certificado.',
        'Sesión requerida'
      );
      return;
    }

    this.regenerarTableIds();
    this.sincronizarJsonTexto();

    const payload: Certificado = {
      ...this.certificado,
      equipment_id: this.certificado.equipment_id.trim(),
      name_equipment: this.certificado.name_equipment.trim(),
      data: this.obtenerJsonEstructurado()
    };

    const certId = this.certificado.id || this.id;

    if (!certId) {
      this.alert.error('No se pudo determinar el ID del certificado a actualizar.', 'Error');
      return;
    }

    this.cargando = true;
    this.cdr.detectChanges();

    this.certificadoService.actualizarCertificado(certId, payload).subscribe({
      next: () => {
        this.cargando = false;
        this.guardandoExitoso = true;
        this.salirSinConfirmar = true;
        this.cdr.detectChanges();

        this.alert.success(
          '¡Certificado actualizado correctamente! Redirigiendo…',
          'Guardado'
        );

        setTimeout(() => {
          this.router.navigate(['/list-cert']);
        }, 2000);
      },
      error: (err: any) => {
        this.cargando = false;
        this.cdr.detectChanges();
        const msg =
          err.error?.message ||
          'Error al actualizar el certificado en la base de datos.';
        this.alert.error(msg, 'Error al guardar');
      }
    });
  }

  // ========== CANCELAR ==========
  async cancelar(): Promise<void> {
    if (!this.salirSinConfirmar && this.tieneCambios()) {
      const ok = await this.alert.confirm(
        'Los cambios que no hayas guardado se perderán. ¿Deseas salir de todas formas?',
        '⚠ Cambios sin guardar',
        {
          type: 'warning',
          confirmText: 'Sí, salir',
          cancelText: 'Seguir editando',
          dismissible: false,
        }
      );
      if (!ok) return;
    }

    this.salirSinConfirmar = true;
    this.alert.info('Operación cancelada por el usuario.', 'Cancelado');
    setTimeout(() => {
      this.router.navigate(['/list-cert']);
    }, 1200);
  }

  // ========== GUARD ==========
  private tieneCambios(): boolean {
    if (!this.certificado) return false;

    const c = this.certificado;
    if (c.equipment_id || c.name_equipment || c.cc || c.comments || c.entity) {
      return true;
    }

    for (const t of this.resultTables) {
      if (t.range || t.comments) return true;
      if (t.min_value !== null && t.min_value !== undefined) return true;
      if (t.max_value !== null && t.max_value !== undefined) return true;
      const tieneFilas = t.rows.some(row =>
        Object.values(row).some(v => v !== null && v !== '' && v !== undefined)
      );
      if (tieneFilas) return true;
    }
    return false;
  }

  async puedeSalir(): Promise<boolean> {
    if (this.salirSinConfirmar) return true;
    if (this.guardMostrando) return false;
    if (!this.tieneCambios()) return true;

    this.guardMostrando = true;
    try {
      const ok = await this.alert.confirm(
        'Si sales ahora, los cambios que no hayas guardado se perderán. ¿Deseas salir de todas formas?',
        '⚠ Cambios sin guardar',
        {
          type: 'warning',
          confirmText: 'Sí, salir',
          cancelText: 'Quedarme',
          dismissible: false,
        }
      );

      if (ok) this.salirSinConfirmar = true;
      return ok;
    } finally {
      this.guardMostrando = false;
    }
  }

  // ========== AYUDA ==========
  ayuda(modal: string): void {
    const clave = String(modal ?? '').trim().toLowerCase();
    let detalle = '';

    if (clave === 'general') {
      detalle = `
        <h3 style="margin-top:0; color:#0d6efd;">1. Datos generales del certificado (edición)</h3>
        <p>Esta vista permite <b>corregir</b> un certificado ya existente. Por seguridad, algunos campos están <b>bloqueados</b>.</p>
      `;
    } else if (clave === 'tablas') {
      detalle = `
        <h3 style="margin-top:0; color:#fd7e14;">2. Estructura de las tablas</h3>
        <p>Cada certificado contiene una o más tablas. En modo edición puedes <b>agregar</b>, <b>eliminar</b> y <b>reordenar</b> columnas y filas.</p>
        <h4>Unidades múltiples</h4>
        <p>Puedes seleccionar <b>varias unidades</b> por tabla. Se guardan separadas por coma en <code>unit</code>: <code>"mV, V, kV"</code>.</p>
      `;
    } else if (clave === 'ocr') {
      detalle = `
        <h3 style="margin-top:0; color:#6f42c1;">3. Extracción desde imagen (OCR)</h3>
        <p>Pega una imagen, recorta la tabla y presiona "Extraer Tabla".</p>
        <div style="background:#fff3cd; border-left:4px solid #ffc107; padding:.6rem .8rem; border-radius:.35rem; margin:.9rem 0;">
          <b>⚠ Advertencia</b> La IA puede cometer errores. Verifica siempre los valores contra el certificado original.
        </div>
      `;
    } else if (clave === 'json') {
      detalle = `
        <h3 style="margin-top:0; color:#212529;">4. JSON y guardado de cambios</h3>
        <p>El JSON se actualiza automáticamente al modificar las tablas.</p>
        <p><code>range</code> ahora se guarda como la unidad (o lista de unidades), y el rango numérico vive en <code>min_value</code> / <code>max_value</code>.</p>
      `;
    } else {
      detalle = `<p>No hay ayuda disponible para <code>${this.escapeHtml(clave)}</code>.</p>`;
    }

    this.alert.alert(detalle, 'Información', {
      type: 'info',
      confirmText: 'Sí, entendido',
      dismissible: true,
      size: 'xl',
      sizeOptions: {
        width: '1200px',
        maxWidth: '95vw',
        maxHeight: '85vh',
        scrollable: true,
        messageMaxHeight: '60vh',
        fontSize: '15px',
        lineHeight: 1.6,
      },
    });
  }

  private escapeHtml(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
