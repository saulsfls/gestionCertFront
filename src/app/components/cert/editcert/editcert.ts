import {
  Component,
  OnInit,
  Input,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Certificado, ResultTable, Column } from '../../../models/certificado.models';
import { CertService } from '../../../services/database/cert.service';
import { AlertService } from '../../../services/core/alert.service';
import { AuthService } from '../../../services/auth/auth.service';

export type DireccionTab = 'horizontal' | 'vertical';
export type JsonPrimitiveType = 'string' | 'number' | 'boolean';
export type TipoDato = 'number' | 'string';

@Component({
  selector: 'app-editcert',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './editcert.html',
  styleUrl: './editcert.css',
})
export class Editcert implements OnInit {

  private readonly alert = inject(AlertService);
  private auth = inject(AuthService);

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

  opcionesTitulo: string[] = [
    'DC Voltage',
    'AC Voltage',
    'DC Current',
    'AC Current',
    'Resistance',
    '4-Wire Resistance',
    'Lightning Impulse Voltage (LI)',
    'Switching Impulse Voltage (SI)',
    'Frequency',
    'Other'
  ];

  private opcionesParametroPorTitulo: Record<string, string[]> = {
    'DC Voltage': ['Voltage'],
    'AC Voltage': ['RMS Voltage', 'Peak-to-Peak Voltage (PP)'],
    'DC Current': ['Current'],
    'AC Current': ['RMS Current', 'Peak-to-Peak Current (PP)'],
    'Resistance': ['Resistance'],
    '4-Wire Resistance': ['4-Wire Resistance'],
    'Lightning Impulse Voltage (LI)': [
      'LI Impulse Voltage',
      'Determination of scale factor and measurement of Ut',
      'Measurement of front time T1',
      'Measurement of time to half value T2',
      'Polarity Linearity Test'
    ],
    'Switching Impulse Voltage (SI)': [
      'LI Impulse Voltage',
      'Determination of scale factor and measurement of Ut',
      'Measurement of front time T1',
      'Measurement of time to half value T2',
      'Polarity Linearity Test'
    ],
    'Frequency': ['Frequency'],
    'Capacitance': ['Capacitance'],
    'Other': []
  };

  certificado: Certificado = {
    equipment_id: '',
    name_equipment: '',
    cc: '',
    id_user: '',
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
    const certId = this.id || this.route.snapshot.paramMap.get('id');
    if (certId) {
      this.cargarCertificadoPorId(certId);
    } else {
      this.alert.error('No se proporcionó un ID de certificado válido.', 'Error de navegación');
    }
  }

  estaBloqueado(campo: keyof Certificado): boolean {
    return this.camposBloqueados.includes(campo);
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
      t.table_id = folio ? `${folio}-T${seq}` : `T${seq}`;
      t.cc_id = folio;
      t.equipment_id = equipo;
    });
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
          this.resultTables = rawTables.map((table: any) => ({
            title: table.title || '',
            equipment_id: table.equipment_id || this.certificado.equipment_id || '',
            cc_id: table.cc_id || this.certificado.cc || '',
            pt: table.pt || '',
            table_id: table.table_id || '',
            parameter: table.parameter || '',
            unit: table.unit || '',
            calibration_equation: table.calibration_equation || '',
            range: table.range || '',
            comments: table.comments || '',
            columns: table.columns || [],
            rows: table.rows || []
          }));

          this.regenerarTableIds();
        } else {
          this.resultTables = [this.crearEstructuraTablaInicial()];
        }

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
    return {
      title: 'DC Voltage',
      equipment_id: this.certificado.equipment_id || '',
      cc_id: this.certificado.cc || '',
      pt: this.certificado.data?.['Result Tables']?.[0]?.pt || '',
      table_id: tableId,
      parameter: this.obtenerOpcionesParametro('DC Voltage')[0] || 'Voltage',
      unit: '',
      calibration_equation: '',
      range: '',
      comments: '',
      columns: [
        { key: 'reading', label: 'Reading', unit: 'V', type: 'number' },
      ],
      rows: [{}]
    };
  }

  // ========== JSON ==========
  sincronizarJsonTexto(): void {
    this.jsonInputText = this.obtenerJsonString();
  }

  onTableChange(): void {
    this.regenerarTableIds();
    this.sincronizarJsonTexto();
  }

  esTituloPredefinido(title: string): boolean {
    const predefinidos = this.opcionesTitulo.slice(0, -1);
    return predefinidos.includes(title);
  }

  obtenerOpcionesParametro(title: string): string[] {
    return this.opcionesParametroPorTitulo[title] || [];
  }

  actualizarParametroSegunTitulo(table: ResultTable): void {
    const opciones = this.obtenerOpcionesParametro(table.title);
    if (opciones.length > 0 && !opciones.includes(table.parameter)) {
      table.parameter = opciones[0];
    }
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
        return {
          title: t.title || '',
          equipment_id: t.equipment_id || this.certificado.equipment_id || '',
          cc_id: t.cc_id || this.certificado.cc || '',
          pt: t.pt || '',
          table_id: t.table_id || '',
          parameter: t.parameter || '',
          unit: t.unit || '',
          calibration_equation: t.calibration_equation || '',
          range: t.range || '',
          comments: t.comments || '',
          columns: t.columns,
          rows: t.rows,
        };
      });

      if (tablasNuevas.length === 0) {
        throw new Error('Debe incluir al menos una tabla de resultados en el JSON.');
      }

      this.resultTables = tablasNuevas;
      this.regenerarTableIds();
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
    this.sincronizarJsonTexto();
    this.alert.info(`Tabla #${this.resultTables.length} agregada.`, 'Nueva tabla');
  }

  eliminarTabla(indexTable: number): void {
    if (this.resultTables.length > 1) {
      this.resultTables.splice(indexTable, 1);

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

  // ============================================================
  // 🆕 MODO: CARGAR DATOS DESDE EXCEL (columna completa)
  // ============================================================
  /**
   * Abre un diálogo con un textarea para pegar los datos copiados
   * de Excel. El usuario debe incluir el encabezado en la primera línea.
   * La cantidad de datos (sin contar el encabezado) debe ser igual o
   * menor a la cantidad de filas actuales de la columna.
   */
    // ============================================================
  // 🆕 MODO: CARGAR DATOS DESDE EXCEL (columna completa)
  // ============================================================
 abrirCargaExcel(tableIndex: number, columnIndex: number): void {
    const table = this.resultTables[tableIndex];
    if (!table) return;
    const col = table.columns[columnIndex];
    if (!col) return;

    this.excelTarget = {
      tableIndex,
      columnIndex,
      label: col.label,
      key: col.key,
      filasActuales: table.rows.length
    };
    this.textoExcel = '';
    this.cdr.detectChanges();

    // Abrir el modal nativo de Bootstrap
    const modalElement = document.getElementById('modalCargaExcel');
    if (modalElement) {
      // @ts-ignore
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
    }
  }

  confirmarCargaExcel(): void {
    if (!this.excelTarget) return;
    const { tableIndex, columnIndex } = this.excelTarget;
    const table = this.resultTables[tableIndex];
    const col = table?.columns[columnIndex];

    if (!table || !col) return;

    const texto = this.textoExcel;

    // Cerrar el modal
    const modalElement = document.getElementById('modalCargaExcel');
    if (modalElement) {
      // @ts-ignore
      const modal = bootstrap.Modal.getInstance(modalElement);
      modal?.hide();
    }

    this.excelTarget = null;

    if (!texto || texto.trim() === '') {
      this.alert.warning('No se recibió ningún texto para procesar.', 'Sin datos');
      return;
    }

    // Reutilizamos el método que ya teníamos
    this.aplicarDatosExcel(table, col, texto);
  }

  /**
   * Procesa el texto pegado y lo aplica a la columna.
   * Formato esperado:
   *   Línea 1: encabezado (label de la columna)
   *   Líneas 2..N: datos
   */
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

    // Primera línea = encabezado
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

    // Convertir cada valor según el tipo de la columna
    const convertir = (v: string): any => {
      if (col.type === 'number') {
        const num = this.extraerNumeroDeTexto(v);
        return num;
      }
      return v;
    };

    // Aplicar los datos a las filas existentes
    table.rows.forEach((row, idx) => {
      if (idx < datos.length) {
        row[col.key] = convertir(datos[idx]);
      }
      // Si hay más filas que datos, las restantes se dejan intactas
    });

    // Actualizar el label si el encabezado es distinto
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
  // MODO 1: ELIMINAR TEXTO (soporta múltiples tablas/columnas)
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
  // MODO 2: SEPARAR SÍMBOLO "±" (soporta múltiples tablas/columnas)
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

      return {
        table_id: table.table_id,
        cc_id: this.certificado.cc || '',
        pt: table.pt || '',
        title: table.title || '',
        equipment_id: this.certificado.equipment_id,
        parameter: table.parameter || '',
        unit: table.unit || '',
        calibration_equation: table.calibration_equation || '',
        range: table.range || '',
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
      id_user: String(user.id_user),
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

  // ================================================================
  //  🚪 GUARD · Confirmación antes de cambiar de página
  // ================================================================
  private tieneCambios(): boolean {
    if (!this.certificado) return false;

    const c = this.certificado;
    if (c.equipment_id || c.name_equipment || c.cc || c.comments || c.entity) {
      return true;
    }

    for (const t of this.resultTables) {
      if (t.calibration_equation || t.range || t.comments) return true;
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

  ayuda(modal: string): void {
    const clave = String(modal ?? '').trim().toLowerCase();

    let detalle = '';

    if (clave === 'general') {
      detalle = `
        <h3 style="margin-top:0; color:#0d6efd;">1. Datos generales del certificado (edición)</h3>
        <p>Esta vista permite <b>corregir</b> un certificado ya existente. Por seguridad, algunos campos están <b>bloqueados</b> y solo se pueden cambiar desde el flujo de creación. Los campos editables son:</p>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Campos editables</h4>
        <ul>
          <li><b>Fecha de calibración:</b> editable. Debe ser <b>igual o anterior</b> a la fecha del certificado y <b>no puede ser futura</b>.</li>
          <li><b>Fecha del certificado:</b> editable. No puede ser anterior a la de calibración ni futura.</li>
          <li><b>Entidad emisora:</b> organismo que emite el certificado (p. ej. <code>LECOE</code>).</li>
          <li><b>Resolución:</b> resolución del instrumento calibrado.</li>
          <li><b>Comentarios:</b> notas generales del certificado.</li>
        </ul>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Campos bloqueados</h4>
        <ul>
          <li><b>ID del equipo, Nombre del equipo, Folio / CC, PT, Intervalo, Tipo, Activo.</b></li>
          <li>Se bloquean porque afectan la relación con el patrón, los <code>table_id</code> y la CMC del instrumento. Si necesitas cambiarlos, crea un nuevo certificado o usa el flujo de alta.</li>
        </ul>

        <p style="color:#6c757d; font-size:0.9em;"><i>Al intentar salir sin guardar, el sistema te preguntará si quieres descartar los cambios. Al guardar se te redirige al listado de certificados.</i></p>
      `;
    } else if (clave === 'tablas') {
      detalle = `
        <h3 style="margin-top:0; color:#fd7e14;">2. Estructura de las tablas</h3>
        <p>Cada certificado contiene una o más tablas. En modo edición puedes <b>agregar</b>, <b>eliminar</b> y <b>reordenar</b> columnas y filas sin restricción.</p>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Encabezado de la tabla</h4>
        <ul>
          <li><b>Título:</b> magnitud general (<code>DC Voltage</code>, <code>AC Voltage</code>, <code>Resistance</code>, …).</li>
          <li><b>Mesurando:</b> variante específica dentro del título (<code>Voltage</code>, <code>RMS Voltage</code>, <code>PP</code>, …).</li>
          <li><b>Unidad:</b> unidad de los valores de la tabla.</li>
          <li><b>Rango:</b> descripción del rango medido (<code>0 V – 100 V</code>).</li>
          <li><b>Ecuación de calibración:</b> si el certificado la reporta.</li>
          <li><b>CC ID / Table ID:</b> generados automáticamente. El <code>Table ID</code> conserva la secuencia original del certificado (<code>-T1</code>, <code>-T2</code>, …).</li>
        </ul>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Columnas</h4>
        <ul>
          <li>Cada columna tiene cuatro atributos editables:
            <ul>
              <li><b>key:</b> identificador técnico (minúsculas, números y guiones bajos). Debe ser único en la tabla.</li>
              <li><b>label:</b> nombre visible.</li>
              <li><b>unit:</b> unidad específica de la columna (opcional).</li>
              <li><b>type:</b> <code>number</code> o <code>string</code>. Al cambiarlo, <b>los valores de la columna se vacían</b> para evitar inconsistencias.</li>
            </ul>
          </li>
          <li>Usa el botón <b>×</b> del encabezado para eliminar una columna (solo si hay más de una).</li>
        </ul>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Filas</h4>
        <ul>
          <li>Cada fila es un punto de medición. Las celdas vacías se muestran con el placeholder <code>null</code>.</li>
          <li>El botón <b>×</b> al final de la fila la elimina (solo si hay más de una).</li>
        </ul>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Navegación con Tab</h4>
        <ul>
          <li>Elige entre navegación <b>vertical</b> (↓) u <b>horizontal</b> (→) al moverte con <kbd>Tab</kbd>.</li>
        </ul>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Comentarios de tabla</h4>
        <p>Notas específicas de esa tabla (condiciones, observaciones). Se guardan dentro de la tabla.</p>
      `;
    } else if (clave === 'eliminar-texto') {
      detalle = `
        <h3 style="margin-top:0; color:#ffc107;">3. Modo "Eliminar Texto"</h3>
        <p>Convierte columnas con valores <b>mezclados de texto y números</b> (por ejemplo <code>1.1A</code>, <code>0.5 V</code>, <code>10 mV</code>) en <b>valores numéricos limpios</b> (<code>1.1</code>, <code>0.5</code>, <code>10</code>).</p>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">¿Para qué sirve?</h4>
        <p>Muchos certificados reportan los valores con la unidad incluida. La app de CMC necesita solo el <b>número</b> para calcular promedios, incertidumbres y errores. Este modo evita que tengas que corregir celda por celda.</p>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Cómo usarlo (paso a paso)</h4>
        <ol>
          <li>Activa el botón <b>Eliminar Texto</b> en la barra superior. Aparecerá el banner amarillo.</li>
          <li>En cada encabezado de columna verás un pill <b>🎯 Limpiar texto</b>. Haz clic en los que quieras procesar (puedes elegir varios, incluso de <b>tablas diferentes</b>).</li>
          <li>Cuando estén seleccionados (aparecerán con ✅ y borde amarillo), presiona el botón <b>🧹 Formatear Texto</b> al final de la lista de tablas.</li>
          <li>Al terminar, cada columna seleccionada:
            <ul>
              <li>Queda forzada a <code>type = number</code>.</li>
              <li>Sus celdas se convierten al número extraído del texto.</li>
            </ul>
          </li>
        </ol>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Cómo interpreta los valores</h4>
        <ul>
          <li><b>Coma decimal europea</b> se normaliza a punto: <code>1,5</code> → <code>1.5</code>.</li>
          <li>Se toma el <b>primer número</b> que aparezca en el texto: <code>±0.21 V</code> → <code>0.21</code>.</li>
          <li>Se respeta el signo negativo: <code>-1.2A</code> → <code>-1.2</code>.</li>
          <li>Se soporta notación científica: <code>1.2e-3 V</code> → <code>0.0012</code> (aplicado en la conversión).</li>
        </ul>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Casos en los que NO se aplica</h4>
        <ul>
          <li>Celdas vacías o con <code>null</code>: se dejan como están.</li>
          <li>Textos que no contienen ningún número (<code>N/A</code>, <code>--</code>): se dejan tal cual y se cuentan como "no convertidos".</li>
          <li>Si no se convierte ningún valor, verás un aviso de <em>Sin cambios</em>.</li>
        </ul>

        <div style="background:#fff3cd; border-left:4px solid #ffc107; padding:.6rem .8rem; border-radius:.35rem; margin:.9rem 0;">
          <b>⚠ Advertencia</b>
          <ul style="margin:.35rem 0 0; padding-left:1.2rem;">
            <li>Este modo <b>sobrescribe los valores originales</b> de la columna. Si querías conservarlos, haz una copia antes (agrega una columna nueva y cópialos).</li>
            <li>El cambio <b>no se puede deshacer</b> desde la interfaz: si algo sale mal, tendrás que corregir celda por celda o recargar sin guardar.</li>
          </ul>
        </div>

        <p style="color:#6c757d; font-size:0.9em;"><i>Ideal para columnas tipo <code>Lectura</code>, <code>Error</code>, <code>Incertidumbre</code> que vienen con unidades embebidas.</i></p>
      `;
    } else if (clave === 'separar-simbolo') {
      detalle = `
        <h3 style="margin-top:0; color:#0dcaf0;">4. Modo "Separar ±"</h3>
        <p>Divide una columna que contiene pares del tipo <code>0.226 ± 0.21</code> en <b>dos columnas</b>: <code>Error Relativo</code> e <code>Incertidumbre</code>. Muy útil cuando el certificado reporta ambos valores juntos en una sola celda.</p>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">¿Para qué sirve?</h4>
        <p>La app de CMC necesita los valores de <b>error</b> e <b>incertidumbre</b> por separado. Este modo evita partirlos manualmente fila por fila.</p>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Cómo usarlo (paso a paso)</h4>
        <ol>
          <li>Activa el botón <b>Separar ±</b> en la barra superior. Aparecerá el banner celeste.</li>
          <li>En cada encabezado de columna verás un pill <b>✂️ Separar ±</b>. Haz clic en los que quieras procesar (puedes elegir varios, incluso de <b>tablas diferentes</b>).</li>
          <li>Cuando estén seleccionados (aparecerán con ✅ y borde celeste), presiona el botón <b>✂️ Separar Columnas</b> al final de la lista de tablas.</li>
          <li>Por cada columna seleccionada:
            <ul>
              <li>La columna original se <b>elimina</b>.</li>
              <li>Se crean dos columnas nuevas en su lugar (con la misma unidad):
                <ul>
                  <li><b>Error Relativo</b> — valor antes del <code>±</code>.</li>
                  <li><b>Incertidumbre</b> — valor después del <code>±</code>.</li>
                </ul>
              </li>
              <li>Ambas quedan forzadas a <code>type = number</code>.</li>
            </ul>
          </li>
        </ol>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Ejemplo</h4>
        <p>Si la columna <code>resultado</code> tiene:</p>
        <pre style="background:#f8f9fa; padding:.6rem; border-radius:.35rem; font-size:.85em;">0.226 ± 0.21
  -0.05 ± 0.03
  1.20 V ± 0.05 V</pre>
        <p>Al separar quedará:</p>
        <pre style="background:#f8f9fa; padding:.6rem; border-radius:.35rem; font-size:.85em;">Error Relativo | Incertidumbre
  0.226          | 0.21
  -0.05          | 0.03
  1.20           | 0.05</pre>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Cómo interpreta los valores</h4>
        <ul>
          <li><b>Se extrae el primer número</b> de cada lado del <code>±</code>. Ignora unidades, símbolos y espacios.</li>
          <li>Coma decimal → punto: <code>0,226</code> → <code>0.226</code>.</li>
          <li>Si una fila <b>no tiene</b> <code>±</code>: se usa el valor completo como <code>Error Relativo</code> y <code>Incertidumbre</code> queda en <code>null</code>.</li>
          <li>Si una fila está vacía: ambas columnas quedan en <code>null</code>.</li>
        </ul>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Comportamiento especial</h4>
        <ul>
          <li>Si <b>ninguna</b> columna seleccionada contiene al menos un <code>±</code>, no se hace ningún cambio y se muestra un error.</li>
          <li>Si <b>algunas</b> columnas no contienen <code>±</code>, esas se omiten y se informa cuántas fueron descartadas.</li>
          <li>Si ya existían columnas con key <code>error_relativo</code> o <code>incertidumbre</code>, se les añade un sufijo numérico (<code>_1</code>, <code>_2</code>) para evitar colisiones.</li>
        </ul>

        <div style="background:#fff3cd; border-left:4px solid #ffc107; padding:.6rem .8rem; border-radius:.35rem; margin:.9rem 0;">
          <b>⚠ Advertencia</b>
          <ul style="margin:.35rem 0 0; padding-left:1.2rem;">
            <li>La columna original <b>se elimina</b>. Si querías conservar los datos tal cual venían, agrega una columna de respaldo antes de separar.</li>
            <li>La operación <b>no se puede deshacer</b> desde la interfaz.</li>
            <li>Revisa los resultados columna por columna: si el certificado usa otro separador (por ejemplo <code>+/-</code> o <code>+−</code>), este modo <b>no lo detectará</b>.</li>
          </ul>
        </div>
      `;
    // 🆕 NUEVO APARTADO DE AYUDA: CARGAR DATOS DESDE EXCEL
    } else if (clave === 'cargar-excel') {
      detalle = `
        <h3 style="margin-top:0; color:#198754;">5. Modo "Cargar datos desde Excel"</h3>
        <p>Permite <b>pegar una columna completa</b> copiada desde Excel (o cualquier hoja de cálculo) directamente en una columna de la tabla, evitando capturar celda por celda.</p>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">¿Para qué sirve?</h4>
        <p>Cuando el certificado original ya viene en Excel, basta con copiar la columna y pegarla aquí. El sistema respeta el encabezado y asigna cada valor a su fila correspondiente.</p>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Cómo usarlo (paso a paso)</h4>
        <ol>
          <li>En el encabezado de la columna destino, presiona el botón <b>📋 Cargar datos de Excel</b>.</li>
          <li>Se abrirá un cuadro de diálogo titulado <b>"Pegar columna"</b> con un área de texto.</li>
          <li>En Excel, selecciona la columna incluyendo el <b>encabezado</b> y cópiala (<kbd>Ctrl</kbd>+<kbd>C</kbd>).</li>
          <li>Pega el contenido en el área de texto (<kbd>Ctrl</kbd>+<kbd>V</kbd>).</li>
          <li>Presiona <b>Cargar datos</b>.</li>
        </ol>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Formato esperado</h4>
        <pre style="background:#f8f9fa; padding:.6rem; border-radius:.35rem; font-size:.85em;">Lectura
1.234
1.235
1.236</pre>
        <ul>
          <li><b>Primera línea:</b> encabezado. Si es distinto al <code>label</code> actual de la columna, se <b>actualiza automáticamente</b>.</li>
          <li><b>Líneas siguientes:</b> un dato por línea, en el mismo orden en que aparecerán en las filas.</li>
          <li>Las líneas vacías se ignoran.</li>
        </ul>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Reglas y validaciones</h4>
        <ul>
          <li>La cantidad de <b>datos</b> (sin contar el encabezado) debe ser <b>igual o menor</b> a la cantidad de filas actuales de la tabla.</li>
          <li>Si llegan <b>más datos que filas</b>, se muestra un error indicando cuántos datos llegaron y cuántas filas hay disponibles. <b>No se aplica ningún cambio.</b></li>
          <li>Si llegan <b>menos datos que filas</b>, solo se llenan las primeras filas; las restantes quedan intactas.</li>
          <li>Si el encabezado viene vacío (por ejemplo, solo se pegaron números), se trata la primera línea como dato y no se modifica el label. <em>Recomendación: incluye siempre el encabezado.</em></li>
        </ul>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Conversión según el tipo de columna</h4>
        <ul>
          <li>Si la columna es <code>type = number</code>: cada dato se convierte con la misma lógica de "Eliminar Texto" (extrae el primer número, normaliza coma decimal, respeta signo y notación científica). Si un valor no contiene número, se guarda como <code>null</code>.</li>
          <li>Si la columna es <code>type = string</code>: cada dato se guarda tal cual, como texto.</li>
        </ul>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Ejemplo</h4>
        <p>Supongamos que la tabla tiene 3 filas y pegas:</p>
        <pre style="background:#f8f9fa; padding:.6rem; border-radius:.35rem; font-size:.85em;">Voltaje
10,5 V
11.2 V
12 V</pre>
        <p>Resultado en la columna (tipo <code>number</code>):</p>
        <pre style="background:#f8f9fa; padding:.6rem; border-radius:.35rem; font-size:.85em;">label = "Voltaje"
Fila 1: 10.5
Fila 2: 11.2
Fila 3: 12</pre>

        <div style="background:#cfe2ff; border-left:4px solid #0d6efd; padding:.6rem .8rem; border-radius:.35rem; margin:.9rem 0;">
          <b>💡 Consejo</b>
          <ul style="margin:.35rem 0 0; padding-left:1.2rem;">
            <li>Antes de cargar, verifica que la tabla tenga suficientes filas. Puedes agregarlas con el botón <b>+ Fila</b>.</li>
            <li>El cambio <b>sobrescribe los valores</b> de las celdas que cubran los datos pegados. Si quieres conservarlos, guarda una copia del JSON primero.</li>
            <li>Si el diálogo se cierra sin confirmar, <b>no se modifica nada</b>.</li>
          </ul>
        </div>
      `;
    } else if (clave === 'json') {
      detalle = `
        <h3 style="margin-top:0; color:#212529;">6. JSON y guardado de cambios</h3>
        <p>El JSON es la representación estructurada de todas las tablas. Se <b>actualiza automáticamente</b> cada vez que modificas una tabla, una columna o una fila.</p>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Acciones</h4>
        <ul>
          <li><b>Copiar JSON:</b> copia el contenido al portapapeles.</li>
          <li><b>Actualizar desde JSON:</b> valida el JSON y reemplaza las tablas del formulario. Útil para cargar datos procesados externamente.</li>
          <li><b>Guardar Cambios:</b> valida y envía el payload al backend para actualizar el certificado.</li>
          <li><b>Cancelar:</b> descarta los cambios y vuelve al listado (con confirmación si hay cambios sin guardar).</li>
        </ul>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Validaciones al guardar</h4>
        <ul>
          <li>ID y nombre del equipo, folio/CC.</li>
          <li>Fechas coherentes (<code>calibración ≤ certificado</code>).</li>
          <li>Cada tabla con título, parámetro y <code>key</code> únicos y válidos.</li>
          <li>Los <code>table_id</code> conservan la secuencia original del certificado.</li>
        </ul>

        <h4 style="font-size:1rem; margin:.8rem 0 .35rem;">Protección contra pérdida de datos</h4>
        <ul>
          <li>Si intentas salir sin guardar, el sistema te pedirá confirmación.</li>
          <li>Tras guardar exitosamente, se te redirige automáticamente al listado de certificados.</li>
        </ul>

        <p style="color:#6c757d; font-size:0.9em;"><i>Consejo: si vas a hacer cambios masivos (limpiar texto o separar ±), haz una copia del JSON primero con "Copiar JSON" para tener un respaldo.</i></p>
      `;
    } else {
      detalle = `
        <p>No hay ayuda disponible para <code>${this.escapeHtml(clave)}</code>.</p>
        <p>Bloques disponibles: <code>general</code>, <code>tablas</code>, <code>eliminar-texto</code>, <code>separar-simbolo</code>, <code>cargar-excel</code>, <code>json</code>.</p>
      `;
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
