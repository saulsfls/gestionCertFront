import {
  Component,
  OnInit,
  ChangeDetectorRef,
  inject,
  PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs/operators';
import { Certificado, ResultTable, Column } from '../../../models/certificado.models';
import { CertService } from '../../../services/database/home/cert.service';
import { ImageService } from '../../../services/database/external/image.service';
import { AlertService } from '../../../services/core/alert.service';
import { PtService } from '../../../services/database/external/pt.service';
import { EquipmentService, PatronCruzado } from '../../../services/database/external/equipment.service';
import {
  ImageCropperComponent,
  ImageCroppedEvent,
  LoadedImage
} from 'ngx-image-cropper';
import { AuthService } from '../../../services/auth/auth.service';
import { CatalogoService } from '../../../services/database/home/catalogo.service';

export type DireccionTab = 'horizontal' | 'vertical';
export type JsonPrimitiveType = 'string' | 'number' | 'boolean';
export type TipoDato = 'number' | 'string';

const DRAFT_KEY = 'newcert_draft_v1';

interface TableImageState {
  imageChangedEvent: Event | null;
  pasteImageFile: File | undefined;
  croppedImageBase64: string;
  cargando: boolean;
  tieneEncabezado: boolean;
}

interface PatronOption {
  id: string;
  name: string;
  pts: string[];
  calibration_date?: string;
  months_calibration?: number;
}

interface DraftPayload {
  certificado: Certificado;
  resultTables: ResultTable[];
  direccionTab: DireccionTab;
  /** Unidades seleccionadas por tabla, serializadas como Record<index, string[]> */
  unidadesPorTabla?: Record<number, string[]>;
  savedAt: string;
}

@Component({
  selector: 'app-newcert',
  standalone: true,
  imports: [FormsModule, CommonModule, ImageCropperComponent],
  templateUrl: './newcert.html',
  styleUrl: './newcert.css',
})
export class Newcert implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private imageService = inject(ImageService);
  private alert = inject(AlertService);
  private auth = inject(AuthService);
  private ptService = inject(PtService);
  private equipmentService = inject(EquipmentService);
  public catalogo = inject(CatalogoService);
  isBrowser: boolean = isPlatformBrowser(this.platformId);

  // ========== PATRONES ==========
  patrones: PatronOption[] = [];
  cargandoPatrones: boolean = false;
  patronSeleccionado: PatronOption | null = null;

  // ========== CATÁLOGO DE PT ==========
  private ptDescripcionPorId = new Map<string, string>();

  // ========== CERTIFICADO ==========
  certificado: Certificado = {
    equipment_id: '', name_equipment: '', cc: '',
    date_cal: '', date_cc: '', calibration_interval: 0, resolution: 0,
    entity: '', cert_type: '', comments: '', active: true, data: {}
  };

  resultTables: ResultTable[] = [];
  direccionTab: DireccionTab = 'vertical';
  jsonInputText: string = '';
  copiadoExitoso: boolean = false;
  guardando: boolean = false;
  imageStates: TableImageState[] = [];
  ocrEnProceso: boolean = false;

  /**
   * Unidades seleccionadas por tabla (checkboxes).
   * Se indexa por el `table_id` de la tabla para sobrevivir a reordenamientos.
   */
  unidadesPorTabla: Map<string, Set<string>> = new Map();

  private draftGuardadoTimer: ReturnType<typeof setTimeout> | null = null;
  /** Cuando es true, NO se guarda el draft (el usuario descartó o ya se limpió el form). */
  private draftDescartado = false;
  /** Cuando es true, aún no se ha cargado nada (evita guardar el form vacío inicial). */
  private draftListo = false;

  constructor(
    private certificadoService: CertService,
    private cdr: ChangeDetectorRef
  ) {}

    // INIT

  async ngOnInit(): Promise<void> {
    this.imageStates = [this.crearEstadoImagenVacio()];

    // 1) Cargar catálogo y patrones en paralelo, y esperar a que terminen
    await Promise.all([
      this.cargarCatalogoAsync(),
      this.cargarPatronesAsync(),
    ]);

    // 2) Ahora sí, resolver el draft con los patrones ya disponibles
    this.resolverDraftInicial();
  }

  private cargarCatalogoAsync(): Promise<void> {
    return new Promise<void>(resolve => {
      this.catalogo.cargarCatalogo().subscribe({
        next: () => {
          for (const table of this.resultTables) {
            if (table.title) {
              const subs = this.catalogo.subparametrosDe(table.title);
              if (subs.length > 0 && !subs.some(s => s.displayName === table.parameter)) {
                table.parameter = subs[0].displayName;
              }
              if (
                !this.unidadesPorTabla.has(table.table_id) ||
                this.unidadesPorTabla.get(table.table_id)!.size === 0
              ) {
                const unidades = this.catalogo.unidadesPara(table.title, table.parameter);
                if (unidades.length > 0) {
                  this.unidadesPorTabla.set(table.table_id, new Set([unidades[0]]));
                }
              }
            }
          }
          this.reconstruirUnitsDesdeSets();
          this.sincronizarJsonTexto();
          this.cdr.detectChanges();
          resolve();
        },
        error: (err) => {
          console.error('Error al cargar catálogo:', err);
          this.alert.error('No se pudo cargar el catálogo de títulos/unidades.', 'Catálogo');
          resolve();
        },
      });
    });
  }

  private cargarPatronesAsync(): Promise<void> {
    this.cargandoPatrones = true;
    return new Promise<void>(resolve => {
      this.ptService.obtenerPt().subscribe({
        next: (ptRaw: any[]) => {
          this.ptDescripcionPorId.clear();
          for (const pt of ptRaw ?? []) {
            const id = String(pt?.id ?? pt?.pt ?? '').trim();
            if (!id) continue;
            const desc = String(pt?.description ?? pt?.name ?? pt?.descripcion ?? '').trim();
            this.ptDescripcionPorId.set(id, desc || id);
          }
          this.equipmentService.getPatronesCruzados().subscribe({
            next: (patronesCruzados: PatronCruzado[]) => {
              this.patrones = this.agruparPatronesPorId(patronesCruzados);
              this.cargandoPatrones = false;
              this.cdr.detectChanges();
              resolve();
            },
            error: (err) => {
              console.error('Error cargando patrones cruzados:', err);
              this.cargandoPatrones = false;
              this.alert.error('No se pudieron cargar los patrones.', 'Error de carga');
              this.cdr.detectChanges();
              resolve();
            },
          });
        },
        error: (err) => {
          console.error('Error cargando catálogo PT:', err);
          // Intentar patrones aunque falle el catálogo PT
          this.equipmentService.getPatronesCruzados().subscribe({
            next: (patronesCruzados: PatronCruzado[]) => {
              this.patrones = this.agruparPatronesPorId(patronesCruzados);
              this.cargandoPatrones = false;
              this.cdr.detectChanges();
              resolve();
            },
            error: () => {
              this.cargandoPatrones = false;
              resolve();
            },
          });
        },
      });
    });
  }

    // DRAFT

  private resolverDraftInicial(): void {
    const draft = this.leerDraftLocalStorage();

    if (!draft) {
      this.inicializarFormularioVacio();
      this.draftListo = true;
      return;
    }

    this.alert.confirm(
      `Tienes un borrador guardado del ${new Date(draft.savedAt).toLocaleString('es-MX')}. ¿Quieres recuperarlo?`,
      'Borrador encontrado',
      {
        type: 'question',
        confirmText: 'Cargar borrador',
        cancelText: 'Descartar',
        dismissible: false,
      }
    )
      .then(cargar => {
        if (cargar) {
          this.restaurarDraft(draft);
        } else {
          this.descartarDraft();
          this.inicializarFormularioVacio();
        }
        this.draftListo = true;
        this.cdr.detectChanges();
      })
      .catch(err => {
        console.error('Error resolviendo borrador:', err);
        this.descartarDraft();
        this.inicializarFormularioVacio();
        this.draftListo = true;
        this.cdr.detectChanges();
      });
  }

  private inicializarFormularioVacio(): void {
    this.resultTables = [this.crearEstructuraTablaInicial()];
    this.imageStates = [this.crearEstadoImagenVacio()];
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
  }

  private leerDraftLocalStorage(): DraftPayload | null {
    if (!this.isBrowser) return null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.certificado) return null;
      if (!Array.isArray(parsed?.resultTables) || parsed.resultTables.length === 0) return null;
      const tieneDatos = parsed.resultTables.some((t: any) =>
        (t?.rows ?? []).some((row: any) =>
          row && Object.values(row).some(v => v !== null && v !== '')
        )
      );
      if (!tieneDatos && !parsed?.certificado?.cc) return null;
      return parsed as DraftPayload;
    } catch (e) {
      console.warn('Draft inválido, se ignora:', e);
      return null;
    }
  }

  private guardarDraftLocalStorage(): void {
    if (!this.isBrowser) return;
    if (this.draftDescartado) return;
    if (!this.draftListo) return;
    try {
      const unidadesPorTabla: Record<number, string[]> = {};
      this.resultTables.forEach((table, idx) => {
        const set = this.unidadesPorTabla.get(table.table_id);
        if (set) unidadesPorTabla[idx] = Array.from(set);
      });

      const payload: DraftPayload = {
        certificado: this.certificado,
        resultTables: this.resultTables,
        direccionTab: this.direccionTab,
        unidadesPorTabla,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('No se pudo guardar draft en localStorage:', e);
    }
  }

  private agendarGuardadoDraft(): void {
    if (!this.isBrowser) return;
    if (this.draftDescartado) return;
    if (!this.draftListo) return;
    if (this.draftGuardadoTimer) clearTimeout(this.draftGuardadoTimer);
    this.draftGuardadoTimer = setTimeout(() => {
      this.guardarDraftLocalStorage();
      this.draftGuardadoTimer = null;
    }, 500);
  }

  private descartarDraft(): void {
    if (!this.isBrowser) return;
    this.draftDescartado = true;
    if (this.draftGuardadoTimer) {
      clearTimeout(this.draftGuardadoTimer);
      this.draftGuardadoTimer = null;
    }
    localStorage.removeItem(DRAFT_KEY);
  }

  private restaurarDraft(draft: DraftPayload): void {
    this.draftDescartado = false;
    this.certificado = draft.certificado;
    this.resultTables = draft.resultTables;
    this.direccionTab = draft.direccionTab ?? 'vertical';
    this.imageStates = this.resultTables.map(() => this.crearEstadoImagenVacio());
    this.regenerarTableIds();

    this.unidadesPorTabla.clear();
    this.resultTables.forEach((table, idx) => {
      const serializadas = draft.unidadesPorTabla?.[idx];
      if (Array.isArray(serializadas) && serializadas.length > 0) {
        this.unidadesPorTabla.set(table.table_id, new Set(serializadas));
      } else if (table.unit) {
        const set = new Set(
          String(table.unit).split(',').map(s => s.trim()).filter(Boolean)
        );
        if (set.size > 0) this.unidadesPorTabla.set(table.table_id, set);
      }
    });

    this.reconstruirUnitsDesdeSets();

    // Patrones ya cargados (ngOnInit esperó), resolver síncrono
    this.resolverPatronDesdeCertificado();

    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
    this.alert.success('Borrador recuperado.', 'Bienvenido de vuelta');
  }

  /**
   * Resuelve `patronSeleccionado` desde `certificado.equipment_id`.
   * Como los patrones ya están cargados, es síncrono.
   * Si el patrón del draft ya no existe, avisa y limpia el campo.
   */
  private resolverPatronDesdeCertificado(): void {
    const id = (this.certificado.equipment_id || '').trim();

    if (!id) {
      this.patronSeleccionado = null;
      return;
    }

    const encontrado = this.patrones.find(p => p.id === id) ?? null;

    if (encontrado) {
      this.patronSeleccionado = encontrado;
      return;
    }

    // El patrón del draft ya no existe en la BD
    this.patronSeleccionado = null;
    this.certificado.equipment_id = '';
    this.certificado.name_equipment = '';

    setTimeout(() => {
      this.alert.warning(
        `El patrón con ID "${id}" del borrador ya no está disponible. ` +
        `Se limpió la selección; elige un patrón nuevo.`,
        'Patrón no encontrado'
      );
    }, 0);
  }

    // CARGA DE CATÁLOGO (recarga manual, opcional)

  cargarCatalogo(force = false): void {
    this.catalogo.cargarCatalogo(force).subscribe({
      next: () => {
        for (const table of this.resultTables) {
          if (table.title) {
            const subs = this.catalogo.subparametrosDe(table.title);
            if (subs.length > 0 && !subs.some(s => s.displayName === table.parameter)) {
              table.parameter = subs[0].displayName;
            }
            if (
              !this.unidadesPorTabla.has(table.table_id) ||
              this.unidadesPorTabla.get(table.table_id)!.size === 0
            ) {
              const unidades = this.catalogo.unidadesPara(table.title, table.parameter);
              if (unidades.length > 0) {
                this.unidadesPorTabla.set(table.table_id, new Set([unidades[0]]));
              }
            }
          }
        }
        this.reconstruirUnitsDesdeSets();
        this.sincronizarJsonTexto();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar catálogo:', err);
        this.alert.error('No se pudo cargar el catálogo de títulos/unidades.', 'Catálogo');
      }
    });
  }

    // PATRONES (recarga manual, opcional)

  cargarPatrones(): void {
    this.cargandoPatrones = true;

    this.ptService.obtenerPt().subscribe({
      next: (ptRaw: any[]) => {
        this.ptDescripcionPorId.clear();
        for (const pt of ptRaw ?? []) {
          const id = String(pt?.id ?? pt?.pt ?? '').trim();
          if (!id) continue;
          const desc = String(pt?.description ?? pt?.name ?? pt?.descripcion ?? '').trim();
          this.ptDescripcionPorId.set(id, desc || id);
        }
        this.cargarPatronesCruzados();
      },
      error: (err) => {
        console.error('Error cargando catálogo PT:', err);
        this.cargarPatronesCruzados();
      }
    });
  }

  private cargarPatronesCruzados(): void {
    this.equipmentService.getPatronesCruzados().subscribe({
      next: (patronesCruzados: PatronCruzado[]) => {
        this.patrones = this.agruparPatronesPorId(patronesCruzados);
        this.cargandoPatrones = false;
        // Refuerzo: re-sincronizar el patrón seleccionado con el certificado
        this.resolverPatronDesdeCertificado();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando patrones:', err);
        this.cargandoPatrones = false;
        this.alert.error('No se pudieron cargar los patrones.', 'Error de carga');
        this.cdr.detectChanges();
      }
    });
  }

  private agruparPatronesPorId(patronesCruzados: PatronCruzado[]): PatronOption[] {
    const mapa = new Map<string, { name: string; pts: Set<string>; calDate?: string; months?: number }>();

    for (const p of patronesCruzados) {
      const id = String(p.id || '').trim();
      if (!id) continue;

      if (!mapa.has(id)) {
        mapa.set(id, {
          name: p.name || id,
          pts: new Set<string>(),
          calDate: p.calibration_date,
          months: p.months_calibration
        });
      }

      if (p.pt) {
        mapa.get(id)!.pts.add(String(p.pt).trim());
      }
    }

    return Array.from(mapa.entries())
      .map(([id, v]) => ({
        id,
        name: v.name,
        pts: Array.from(v.pts).sort((a, b) => a.localeCompare(b, 'es')),
        calibration_date: v.calDate,
        months_calibration: v.months
      }))
      .sort((a, b) => a.id.localeCompare(b.id, 'es'));
  }

    // HELPERS DE PT / PATRÓN

  descripcionPt(ptId: string): string {
    if (!ptId) return '';
    return this.ptDescripcionPorId.get(ptId) ?? ptId;
  }

  get patronTienePts(): boolean {
    return (this.patronSeleccionado?.pts?.length ?? 0) > 0;
  }

  get ptsDelPatron(): string[] {
    return this.patronSeleccionado?.pts ?? [];
  }

  get hayPatronSeleccionado(): boolean {
    return this.patronSeleccionado !== null;
  }

  ptsDisponiblesParaTabla(_table: ResultTable): string[] {
    return this.ptsDelPatron;
  }

  onPatronChange(): void {
    const id = (this.certificado.equipment_id || '').trim();
    const patron = this.patrones.find(p => p.id === id) ?? null;
    this.patronSeleccionado = patron;

    if (!patron) {
      this.certificado.name_equipment = '';
      this.certificado.date_cal = '';
      this.certificado.calibration_interval = 0;
      this.sincronizarJsonTexto();
      this.cdr.detectChanges();
      return;
    }

    this.certificado.name_equipment = patron.name || '';
    this.certificado.date_cal = patron.calibration_date ?? '';
    this.certificado.calibration_interval = Number(patron.months_calibration) || 0;

    for (const table of this.resultTables) {
      if (table.pt && !patron.pts.includes(table.pt)) {
        table.pt = '';
      }
    }

    this.regenerarTableIds();
    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
  }

  onTablePtChange(table: ResultTable, ptId: string): void {
    table.pt = (ptId || '').trim();
    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
  }

    // CATÁLOGO: getters para template

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

    // SELECCIÓN MÚLTIPLE DE UNIDADES

  unidadesSeleccionadasDe(table: ResultTable): Set<string> {
    const key = table.table_id || '';
    if (!this.unidadesPorTabla.has(key)) {
      this.unidadesPorTabla.set(key, new Set());
    }
    return this.unidadesPorTabla.get(key)!;
  }

  toggleUnidad(table: ResultTable, unidad: string): void {
    const set = this.unidadesSeleccionadasDe(table);
    if (set.has(unidad)) {
      set.delete(unidad);
    } else {
      set.add(unidad);
    }
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
    const arr = Array.from(set);
    table.unit = arr.join(', ');
    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
  }

  private reconstruirUnitsDesdeSets(): void {
    for (const table of this.resultTables) {
      const set = this.unidadesSeleccionadasDe(table);
      table.unit = Array.from(set).join(', ');
    }
  }

    // CAMBIO DE TÍTULO / PARÁMETRO

  actualizarParametroSegunTitulo(table: ResultTable): void {
    const opciones = this.obtenerOpcionesParametro(table.title);
    if (opciones.length > 0 && !opciones.includes(table.parameter)) {
      table.parameter = opciones[0];
    }

    const set = this.unidadesSeleccionadasDe(table);
    if (set.size === 0) {
      const unidades = this.catalogo.unidadesPara(table.title, table.parameter);
      if (unidades.length > 0) {
        set.add(unidades[0]);
        this.sincronizarUnitDesdeSeleccion(table);
      }
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
      this.sincronizarUnitDesdeSeleccion(table);
    }

    this.regenerarTableIds();
    this.sincronizarJsonTexto();
  }

  onParameterChange(table: ResultTable): void {
    const set = this.unidadesSeleccionadasDe(table);
    if (set.size === 0) {
      const unidades = this.catalogo.unidadesPara(table.title, table.parameter);
      if (unidades.length > 0) {
        set.add(unidades[0]);
        this.sincronizarUnitDesdeSeleccion(table);
      }
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
      this.sincronizarUnitDesdeSeleccion(table);
    }
    this.sincronizarJsonTexto();
  }

    // table_id

  private construirTableId(indexTable: number): string {
    const folio = (this.certificado.cc || '').trim();
    const sufijo = `T${indexTable + 1}`;
    return folio ? `${folio}-${sufijo}` : sufijo;
  }

  private regenerarTableIds(): void {
    const folio = (this.certificado.cc || '').trim();
    const equipo = this.certificado.equipment_id || '';

    const mapViejo: Array<{ oldId: string; nuevoId: string }> = [];

    this.resultTables.forEach((table, i) => {
      const oldId = table.table_id;
      const nuevoId = this.construirTableId(i);
      if (oldId && oldId !== nuevoId) {
        mapViejo.push({ oldId, nuevoId });
      }
      table.table_id = nuevoId;
      table.cc_id = folio;
      table.equipment_id = equipo;
    });

    for (const { oldId, nuevoId } of mapViejo) {
      const set = this.unidadesPorTabla.get(oldId);
      if (set) {
        this.unidadesPorTabla.delete(oldId);
        this.unidadesPorTabla.set(nuevoId, set);
      }
    }
  }

    // ESTADO DE IMAGEN

  private crearEstadoImagenVacio(): TableImageState {
    return {
      imageChangedEvent: null, pasteImageFile: undefined, croppedImageBase64: '',
      cargando: false, tieneEncabezado: true
    };
  }

    // ESTRUCTURA INICIAL

  private crearEstructuraTablaInicial(): ResultTable {
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
      pt: '',
      table_id: '',
      parameter: paramInicial,
      unit: unidadInicial,
      min_value: null,
      max_value: null,
      range: '',
      comments: '',
      columns: [{ key: 'llave_unica', label: 'etiqueta', unit: 'unidad', type: 'number' }],
      rows: [{}]
    };
  }

    // JSON

  sincronizarJsonTexto(): void {
    this.jsonInputText = this.obtenerJsonString();
    this.agendarGuardadoDraft();
  }

  onTableChange(): void {
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
  }

  onCcChange(): void {
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
  }

    // VALIDACIÓN DE KEY

  private validarKey(key: string, table: ResultTable, columnaActual?: Column): { valido: boolean; mensaje?: string } {
    const keyLimpio = key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!keyLimpio) return { valido: false, mensaje: 'El key no puede estar vacío.' };
    if (!/^[a-z0-9_]+$/.test(keyLimpio)) return { valido: false, mensaje: 'El key solo puede contener letras, números y guión bajo.' };

    for (const col of table.columns) {
      if (columnaActual && col === columnaActual) continue;
      if (col.key === keyLimpio) return { valido: false, mensaje: `El key "${keyLimpio}" ya existe en esta tabla.` };
    }
    return { valido: true };
  }

    // CARGAR DESDE JSON

  actualizarFormularioDesdeJson(): void {
    try {
      const parsedJson = JSON.parse(this.jsonInputText);
      if (!parsedJson || typeof parsedJson !== 'object' || !Array.isArray(parsedJson['Result Tables'])) {
        throw new Error('El JSON debe contener la propiedad "Result Tables" como un arreglo.');
      }

      const tablasNuevas: ResultTable[] = parsedJson['Result Tables'].map((t: any, index: number) => {
        if (!Array.isArray(t.columns) || !Array.isArray(t.rows)) {
          throw new Error(`Estructura inválida en la Tabla #${index + 1}. Debe incluir "columns" y "rows".`);
        }

        let min_value = t.min_value ?? null;
        let max_value = t.max_value ?? null;
        if ((min_value === null || max_value === null) && typeof t.range === 'string') {
          const parsedRange = this.parseRangeString(t.range);
          if (min_value === null) min_value = parsedRange.min;
          if (max_value === null) max_value = parsedRange.max;
        }

        return {
          title: t.title || '',
          equipment_id: t.equipment_id || this.certificado.equipment_id || '',
          cc_id: t.cc_id || t.cc || this.certificado.cc || '',
          pt: t.pt || '',
          table_id: t.table_id || '',
          parameter: t.parameter || '',
          unit: t.unit || '',
          min_value,
          max_value,
          range: t.range || '',
          comments: t.comments || '',
          columns: t.columns,
          rows: t.rows
        };
      });

      if (tablasNuevas.length === 0) throw new Error('Debe incluir al menos una tabla.');

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

    // NAVEGACIÓN TAB

  onTabKeydown(event: Event, tableIndex: number, rowIndex: number, colIndex: number): void {
    if (this.direccionTab === 'horizontal') return;
    const keyEvent = event as KeyboardEvent;
    keyEvent.preventDefault();
    const direction = keyEvent.shiftKey ? -1 : 1;
    const siguienteFilaIndex = rowIndex + direction;
    const targetId = `input-${tableIndex}-${siguienteFilaIndex}-${colIndex}`;
    const targetInput = document.getElementById(targetId) as HTMLInputElement;
    if (targetInput) { targetInput.focus(); targetInput.select(); }
  }

    // GESTIÓN DE TABLAS

  agregarTabla(): void {
    const nueva = this.crearEstructuraTablaInicial();
    this.resultTables.push(nueva);
    this.imageStates.push(this.crearEstadoImagenVacio());
    this.regenerarTableIds();
    if (nueva.unit) {
      this.unidadesPorTabla.set(nueva.table_id, new Set([nueva.unit]));
    }
    this.sincronizarJsonTexto();
  }

  eliminarTabla(indexTable: number): void {
    if (this.resultTables.length > 1) {
      const eliminada = this.resultTables[indexTable];
      this.unidadesPorTabla.delete(eliminada.table_id);
      this.resultTables.splice(indexTable, 1);
      this.imageStates.splice(indexTable, 1);
      this.regenerarTableIds();
      this.sincronizarJsonTexto();
    }
  }

    // GESTIÓN DE COLUMNAS

  async agregarColumna(table: ResultTable): Promise<void> {
    const posicionOptions = [
      { label: 'Al final (después de la última)', value: '__final__' },
      ...table.columns.map((c, i) => ({
        label: `Después de "${c.label || c.key}" (posición ${i + 1})`,
        value: c.key,
      })),
    ];

    const values = await this.alert.form({
      type: 'question',
      title: 'Nueva columna',
      message: '¿Dónde quieres insertar la nueva columna?',
      confirmText: 'Insertar',
      cancelText: 'Cancelar',
      dismissible: true,
      size: 'md',
      form: {
        columns: 1,
        submitText: 'Insertar',
        validateOnSubmit: true,
        fields: [
          {
            name: 'posicion',
            label: 'Posición',
            type: 'select',
            required: true,
            value: '__final__',
            options: posicionOptions,
          },
        ],
      },
    });

    if (values === null) return;

    const posicion = String(values['posicion'] ?? '__final__');
    const nuevaKey = this.generarKeyUnica(table, 'nueva_columna');
    const nuevaCol: Column = {
      key: nuevaKey,
      label: `Nueva Columna`,
      unit: '',
      type: 'number',
    };

    if (posicion === '__final__') {
      table.columns.push(nuevaCol);
    } else {
      const idx = table.columns.findIndex(c => c.key === posicion);
      if (idx >= 0) {
        table.columns.splice(idx + 1, 0, nuevaCol);
      } else {
        table.columns.push(nuevaCol);
      }
    }

    table.rows.forEach(row => { row[nuevaKey] = null; });

    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
  }

  private generarKeyUnica(table: ResultTable, prefijo: string): string {
    const existentes = new Set(table.columns.map(c => c.key));
    let base = prefijo;
    let contador = 1;
    let key = base;
    while (existentes.has(key)) {
      key = `${base}_${contador++}`;
    }
    return key;
  }

  eliminarColumna(table: ResultTable, indexColumn: number): void {
    if (table.columns.length <= 1) return;
    const keyAEliminar = table.columns[indexColumn].key;
    table.columns.splice(indexColumn, 1);
    table.rows.forEach(row => { delete row[keyAEliminar]; });
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
      return;
    }

    col.key = nuevaKey;
    table.rows.forEach(row => {
      row[nuevaKey] = row[viejaKey] ?? null;
      delete row[viejaKey];
    });
    this.sincronizarJsonTexto();
  }

  cambiarTipoDato(_col: Column, _table: ResultTable): void {
    this.sincronizarJsonTexto();
  }

    // GESTIÓN DE FILAS

  agregarFila(table: ResultTable): void {
    const nuevaFila: Record<string, any> = {};
    table.columns.forEach(col => { nuevaFila[col.key] = null; });
    table.rows.push(nuevaFila);
    this.sincronizarJsonTexto();
  }

  eliminarFila(table: ResultTable, indexRow: number): void {
    if (table.rows.length > 1) {
      table.rows.splice(indexRow, 1);
      this.sincronizarJsonTexto();
    }
  }

    // HELPERS NUMÉRICOS

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

    // HELPERS DE FECHA

  private parseFechaLocal(fecha: string | Date | null | undefined): Date | null {
    if (!fecha) return null;
    if (fecha instanceof Date) return isNaN(fecha.getTime()) ? null : fecha;
    const str = String(fecha).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(str);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  private hoyLocal(): Date {
    const h = new Date();
    h.setHours(0, 0, 0, 0);
    return h;
  }

  private diasEntre(a: Date, b: Date): number {
    const MS = 1000 * 60 * 60 * 24;
    return Math.round((b.getTime() - a.getTime()) / MS);
  }

    // MÉTODOS DE IMAGEN

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

    // NOTACIÓN CIENTÍFICA

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

    // PARSEADOR DE TEXTO

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

    // PARSEADOR DE HTML

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

    // CONSTRUCCIÓN DEL JSON

  obtenerJsonEstructurado(): object {
    this.regenerarTableIds();

    const tablasProcesadas = this.resultTables.map(table => {
      const tiposPorKey: Record<string, TipoDato> = {};
      table.columns.forEach(col => { tiposPorKey[col.key] = col.type; });

      const filasProcesadas = table.rows.map(row => {
        const nuevaFila: Record<string, any> = {};
        Object.keys(row).forEach(key => {
          const valorRaw = row[key];
          const esNumero = tiposPorKey[key] === 'number';
          if (esNumero) {
            if (valorRaw === null || valorRaw === undefined || valorRaw === '') nuevaFila[key] = null;
            else {
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
        pt: (table.pt || '').trim(),
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
      this.alert.success('JSON copiado al portapapeles');
      setTimeout(() => {
        this.copiadoExitoso = false;
        this.cdr.detectChanges();
      }, 2500);
    });
  }

    // VALIDACIÓN DE FORMULARIO

  validarFormulario(): boolean {
    const errores: string[] = [];
    const c = this.certificado;

    if (!c.equipment_id?.trim()) errores.push('• Debes seleccionar un equipo patrón.');
    else if (!this.patronSeleccionado) errores.push('• El patrón seleccionado no es válido. Vuelve a elegirlo.');

    if (!c.name_equipment?.trim()) errores.push('• El "Nombre del Equipo" está vacío.');
    else if (c.name_equipment.trim().length < 3) errores.push('• El "Nombre del Equipo" debe tener al menos 3 caracteres.');

    if (!c.cc?.trim()) errores.push('• El "Folio del Certificado (cc)" es obligatorio.');
    else if (!/^[A-Za-z0-9\-_/ ]+$/.test(c.cc.trim())) errores.push('• El "Folio (cc)" contiene caracteres no permitidos.');

    if (!c.entity?.trim()) errores.push('• La "Entidad" es obligatoria.');
    if (!c.cert_type?.trim()) errores.push('• El "Tipo de Certificado" es obligatorio.');

    const hoy = this.hoyLocal();
    const fechaCal = this.parseFechaLocal(c.date_cal);
    const fechaCc = this.parseFechaLocal(c.date_cc);

    if (!c.date_cal) errores.push('• La "Fecha de Calibración" es obligatoria.');
    else if (!fechaCal) errores.push('• La "Fecha de Calibración" no tiene un formato válido.');
    else if (fechaCal > hoy) errores.push('• La "Fecha de Calibración" no puede ser una fecha futura.');
    else if (fechaCal.getFullYear() < 1950) errores.push('• La "Fecha de Calibración" parece demasiado antigua (anterior a 1950).');

    if (!c.date_cc) errores.push('• La "Fecha del Certificado" es obligatoria.');
    else if (!fechaCc) errores.push('• La "Fecha del Certificado" no tiene un formato válido.');
    else if (fechaCc > hoy) errores.push('• La "Fecha del Certificado" no puede ser una fecha futura.');

    if (fechaCal && fechaCc) {
      if (fechaCc < fechaCal) errores.push('• La "Fecha del Certificado" no puede ser anterior a la "Fecha de Calibración".');
      if (this.diasEntre(fechaCal, fechaCc) > 365 * 2) errores.push('• Hay más de 2 años entre la "Fecha de Calibración" y la "Fecha del Certificado". Verifica.');
    }

    const intervalo = Number(c.calibration_interval);
    if (!Number.isFinite(intervalo) || intervalo <= 0) errores.push('• El "Intervalo de Calibración" debe ser un número mayor que 0.');
    else if (intervalo > 120) errores.push('• El "Intervalo de Calibración" parece inusualmente alto (> 120 meses).');

    const resolucion = Number(c.resolution);
    if (!Number.isFinite(resolucion) || resolucion < 0) errores.push('• La "Resolución" debe ser un número mayor o igual a 0.');

    for (let i = 0; i < this.resultTables.length; i++) {
      const table = this.resultTables[i];
      const n = i + 1;

      if (!table.title?.trim()) errores.push(`• Tabla #${n}: el título es obligatorio.`);
      if (!table.parameter?.trim()) errores.push(`• Tabla #${n}: el parámetro es obligatorio.`);

      if (this.patronSeleccionado && this.patronSeleccionado.pts.length > 0) {
        if (!table.pt?.trim()) errores.push(`• Tabla #${n}: debes seleccionar un PT para esta tabla.`);
        else if (!this.patronSeleccionado.pts.includes(table.pt)) errores.push(`• Tabla #${n}: el PT "${table.pt}" no pertenece al patrón seleccionado.`);
      }

      if (!table.columns || table.columns.length === 0) {
        errores.push(`• Tabla #${n}: debe tener al menos una columna.`);
        continue;
      }

      const keys = table.columns.map(k => k.key.trim().toLowerCase().replace(/\s+/g, '_'));
      const uniqueKeys = new Set(keys);
      if (keys.length !== uniqueKeys.size) errores.push(`• Tabla #${n}: hay columnas con "key" duplicado.`);

      for (const col of table.columns) {
        const keyLimpio = col.key?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
        if (!keyLimpio) errores.push(`• Tabla #${n}: hay una columna sin "key".`);
        else if (!/^[a-z0-9_]+$/.test(keyLimpio)) errores.push(`• Tabla #${n}: el key "${col.key}" contiene caracteres no permitidos.`);
      }

      const colsNumericas = table.columns.filter(col => col.type === 'number');
      if (colsNumericas.length > 0) {
        for (let r = 0; r < table.rows.length; r++) {
          for (const col of colsNumericas) {
            const val = table.rows[r][col.key];
            if (this.esValorInvalido(val, col)) errores.push(`• Tabla #${n}, fila ${r + 1}, columna "${col.label || col.key}": valor no numérico ("${val}").`);
          }
        }
      }
    }

    if (errores.length > 0) {
      const visibles = errores.slice(0, 8);
      const restantes = errores.length - visibles.length;
      const detalle = visibles.join('\n') + (restantes > 0 ? `\n… y ${restantes} error(es) más.` : '');
      this.alert.error(detalle, `Errores de validación (${errores.length})`);
      return false;
    }
    return true;
  }

  private traducirErrorBackend(err: any): { titulo: string; mensaje: string } {
    if (err?.name === 'TimeoutError') return { titulo: 'Tiempo de espera agotado', mensaje: 'El servidor tardó más de 30 s en responder. Verifica tu conexión e inténtalo de nuevo.' };
    if (err?.status === 0 || (err?.name === 'HttpErrorResponse' && !err?.status)) return { titulo: 'Sin conexión', mensaje: 'No se pudo contactar con el servidor. Revisa tu red o inténtalo más tarde.' };

    const status = err?.status ?? err?.error?.status ?? null;
    const body = err?.error ?? {};
    const code = body.code ?? err?.code ?? null;
    const message = body.message ?? err?.message ?? '';
    const detail = body.detail ?? err?.detail ?? '';
    const constraint = body.constraint ?? err?.constraint ?? '';
    const column = body.column ?? err?.column ?? '';

    if (code === 'ER_DUP_ENTRY' || status === 409) {
      const texto = `${message} ${detail} ${constraint}`.toLowerCase();
      const folio = (this.certificado.cc || '').trim();
      if (texto.includes('cc') || texto.includes('folio')) return { titulo: 'Folio duplicado', mensaje: `Ya existe un certificado registrado con el folio "${folio}".` };
      if (texto.includes('equipment_id')) return { titulo: 'Equipo duplicado', mensaje: `Ya existe un certificado para el equipo "${this.certificado.equipment_id}".` };
      return { titulo: 'Registro duplicado', mensaje: detail || message || 'El registro ya existe en la base de datos.' };
    }

    if (status === 400) return { titulo: 'Solicitud inválida', mensaje: message || detail || 'Revisa los datos enviados.' };
    if (status === 401 || status === 403) return { titulo: 'Acceso denegado', mensaje: 'No tienes permisos para realizar esta acción.' };
    if (status === 404) return { titulo: 'No encontrado', mensaje: message || 'El recurso solicitado no existe.' };
    if (status === 413) return { titulo: 'Datos demasiado grandes', mensaje: 'El payload excede el tamaño permitido.' };
    if (status >= 500) return { titulo: `Error del servidor (${status})`, mensaje: message || 'Ocurrió un error interno. Intenta más tarde o contacta al administrador.' };

    return { titulo: 'Error al guardar', mensaje: message || detail || 'Error desconocido al conectar con la API.' };
  }

    // GUARDAR

  guardarCertificado(): void {
    if (this.guardando) return;
    if (!this.validarFormulario()) return;
    const user = this.auth.getUser();
    if (!user) {
      this.alert.error('Debes iniciar sesión para guardar un certificado.', 'Sesión requerida');
      return;
    }

    this.guardando = true;
    this.cdr.detectChanges();

    this.regenerarTableIds();
    this.sincronizarJsonTexto();

    const payload: Certificado = {
      ...this.certificado,
      equipment_id: (this.certificado.equipment_id ?? '').trim(),
      name_equipment: (this.certificado.name_equipment ?? '').trim(),
      cc: (this.certificado.cc ?? '').trim(),
      entity: (this.certificado.entity ?? '').trim(),
      cert_type: (this.certificado.cert_type ?? '').trim(),
      data: this.obtenerJsonEstructurado()
    };

    this.certificadoService.crearCertificado(payload).pipe(
      timeout(30000),
      finalize(() => {
        this.guardando = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        this.alert.success('¡Certificado guardado correctamente!', 'Guardado');
        this.limpiarFormulario();
      },
      error: (err: any) => {
        console.error('Error al guardar:', err);
        const { titulo, mensaje } = this.traducirErrorBackend(err);
        this.alert.error(mensaje, titulo);
        if (titulo === 'Folio duplicado') {
          setTimeout(() => {
            const el = document.getElementById('cc') as HTMLInputElement | null;
            el?.focus();
            el?.select();
          }, 0);
        }
      }
    });
  }

    // LIMPIAR

  limpiarFormulario(): void {
    this.draftDescartado = false;
    this.draftListo = true;
    this.certificado = {
      equipment_id: '', name_equipment: '', cc: '',
      date_cal: '', date_cc: '', calibration_interval: 0, resolution: 0,
      entity: '', cert_type: '', comments: '', active: true, data: {}
    };
    this.patronSeleccionado = null;
    this.resultTables = [this.crearEstructuraTablaInicial()];
    this.imageStates = [this.crearEstadoImagenVacio()];
    this.ocrEnProceso = false;
    this.unidadesPorTabla.clear();
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
    this.descartarDraft();
    this.cdr.detectChanges();
  }

    // AYUDA

  ayuda(modal: string): void {
    const clave = String(modal ?? '').trim().toLowerCase();
    let detalle = '';

    if (clave === 'general') {
      detalle = `
        <h3 style="margin-top:0; color:#0d6efd;">1. Datos generales del certificado</h3>
        <p>Esta sección registra la identificación del certificado y del instrumento calibrado. Los campos marcados con <span style="color:#dc3545;">*</span> son obligatorios.</p>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Folio / CC</h4>
        <ul>
          <li>Número único del certificado. No puede repetirse en el sistema.</li>
          <li>Al cambiarlo se <b>regeneran automáticamente</b> los <code>table_id</code> de todas las tablas (<code>CC-XXXX-T1</code>, <code>CC-XXXX-T2</code>, …).</li>
        </ul>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Fechas</h4>
        <ul>
          <li><b>Fecha de calibración:</b> se autollena al elegir el patrón, pero sigue siendo editable.</li>
          <li><b>Fecha del certificado:</b> la ingresas manualmente. Debe ser <b>igual o posterior</b> a la de calibración y <b>no puede ser futura</b>.</li>
        </ul>
      `;
    } else if (clave === 'patron') {
      detalle = `
        <h3 style="margin-top:0; color:#198754;">2. Selección del patrón y del PT por tabla</h3>
        <p>El componente usa una jerarquía <b>Patrón → PT por tabla</b>.</p>
      `;
    } else if (clave === 'tablas') {
      detalle = `
        <h3 style="margin-top:0; color:#fd7e14;">3. Estructura de las tablas de resultados</h3>
        <p>Cada certificado contiene <b>una o más tablas</b>.</p>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Unidades</h4>
        <p>Puedes seleccionar <b>múltiples unidades</b> por tabla. Se guardan separadas por coma en el campo <code>unit</code>, ej. <code>"mV, V, kV"</code>.</p>
        <p>Si el catálogo no tiene la unidad que necesitas, agrégala manualmente con el campo <b>"Agregar otra unidad…"</b>.</p>
      `;
    } else if (clave === 'ocr') {
      detalle = `
        <h3 style="margin-top:0; color:#6f42c1;">4. Extracción de tablas desde imagen (OCR)</h3>
        <p>Convierte una captura de la tabla en <b>columnas y filas editables</b>.</p>
      `;
    } else if (clave === 'json') {
      detalle = `
        <h3 style="margin-top:0; color:#212529;">5. JSON del certificado y guardado</h3>
        <p>El JSON es la representación estructurada de todas las tablas.</p>
        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Unidades múltiples</h4>
        <p>El campo <code>unit</code> del JSON contiene las unidades seleccionadas separadas por coma: <code>"mV, V, kV"</code>.</p>
      `;
    } else {
      detalle = `
        <p>No hay ayuda disponible para <code>${this.escapeHtml(clave)}</code>.</p>
      `;
    }

    this.alert.alert(detalle, 'Información', {
      type: 'info', confirmText: 'Sí, entendido', dismissible: true, size: 'xl',
      sizeOptions: { width: '1200px', maxWidth: '95vw', maxHeight: '85vh', scrollable: true, messageMaxHeight: '60vh', fontSize: '15px', lineHeight: 1.6 },
    });
  }

  private escapeHtml(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
}
