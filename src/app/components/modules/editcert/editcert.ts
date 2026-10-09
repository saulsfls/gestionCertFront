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
import { CertService } from '../../../services/cert.service';
import { AlertService } from '../../../services/alert.service';

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

  @Input() id!: string | number;

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
    'Other': []
  };

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

  private lastTableSeq = 0;

  private guardMostrando = false;

  private salirSinConfirmar = false;

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
            table_id: table.table_id || '',
            cmc: table.cmc || '',
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
          table_id: t.table_id || '',
          cmc: t.cmc || '',
          parameter: t.parameter || '',
          unit: t.unit || '',
          calibration_equation: t.calibration_equation || '',
          range: t.range || '',
          comments: t.comments || '',
          columns: t.columns,
          rows: t.rows
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

    // Normaliza coma decimal europea a punto
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

    // Ordenar de mayor a menor índice para evitar problemas al reemplazar in-place
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
      // Recalcular unicidad considerando que agregaremos key1 también
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

  // ========== GUARDAR ==========
  guardarCertificado(): void {
    if (this.cargando) return;
    if (!this.validarFormulario()) return;

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
          this.router.navigate(['/listcert']);
        }, 2000);
      },
      error: (err: any) => {
        this.cargando = false;
        this.cdr.detectChanges();
        const msg = err.error?.message || 'Error al actualizar el certificado en la base de datos.';
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
      this.router.navigate(['/listcert']);
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
}
