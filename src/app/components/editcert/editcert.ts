import {
  Component,
  OnInit,
  Input,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Certificado, ResultTable, Column } from '../../models/certificado.models';
import { CertService } from '../../services/cert.service';

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
  @Input() id!: string | number;

  // Lista de opciones para el título (en inglés)
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

  // Mapa de opciones de parámetro por título (en inglés)
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

  // 1. Formulario del certificado
  certificado: Certificado = {
    equipment_id: '',
    name_equipment: '',
    cc: '',
    date_cal: '',
    date_cc: '',
    entity: '',
    cert_type: '',
    comments: '',
    active: true,
    data: {}
  };

  // 2. Control de Tablas Dinámicas y Vista (ahora con nombres en inglés)
  resultTables: ResultTable[] = [];
  direccionTab: DireccionTab = 'vertical';
  cargando: boolean = false;

  // Control del JSON bidireccional
  jsonInputText: string = '';

  // Control de alertas Bootstrap
  mensajeRespuesta: string | null = null;
  esError: boolean = false;
  guardandoExitoso: boolean = false;
  copiadoExitoso: boolean = false;

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
      this.mostrarAlerta('No se proporcionó un ID de certificado válido.', true);
    }
  }

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

        // Cargar tablas desde el data del certificado (ahora espera "Result Tables")
        if (certData.data && certData.data['Result Tables']) {
          this.resultTables = certData.data['Result Tables'].map((table: any) => {
            return {
              title: table.title || '',
              equipment_id: table.equipment_id || this.certificado.equipment_id || '',
              parameter: table.parameter || '',
              unit: table.unit || '',
              calibration_equation: table.calibration_equation || '',
              range: table.range || '',
              comments: table.comments || '',
              columns: table.columns || [],
              rows: table.rows || []
            };
          });
        } else {
          // Si no existe, inicializar con una tabla por defecto
          this.resultTables = [this.crearEstructuraTablaInicial()];
        }

        this.sincronizarJsonTexto();
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error al obtener certificado:', err);
        const msg = err.error?.message || 'Error al obtener la información del certificado.';
        this.mostrarAlerta(msg, true);
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  private formatearFechaISO(fechaStr: string): string {
    if (!fechaStr) return '';
    const date = new Date(fechaStr);
    return date.toISOString().split('T')[0];
  }

  private crearEstructuraTablaInicial(): ResultTable {
    return {
      title: 'DC Voltage',
      equipment_id: this.certificado.equipment_id || '',
      parameter: this.obtenerOpcionesParametro('DC Voltage')[0] || 'Voltage',
      unit: '',
      calibration_equation: '',
      range: '',
      comments: '',
      columns: [
        { key: 'key', label: 'Label', unit: 'Units', type: 'number' },
      ],
      rows: [{}]
    };
  }

  // --- Sincronización de JSON ---
  sincronizarJsonTexto(): void {
    this.jsonInputText = this.obtenerJsonString();
  }

  onTableChange(): void {
    this.resultTables.forEach(table => {
      table.equipment_id = this.certificado.equipment_id;
    });
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

  private validarKey(key: string, table: ResultTable, columnaActual?: Column): { valido: boolean, mensaje?: string } {
    const keyLimpio = key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!keyLimpio) {
      return { valido: false, mensaje: 'El key no puede estar vacío.' };
    }
    if (!/^[a-z0-9_]+$/.test(keyLimpio)) {
      return { valido: false, mensaje: 'El key solo puede contener letras, números y guión bajo.' };
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
      if (!parsedJson || typeof parsedJson !== 'object' || !Array.isArray(parsedJson['Result Tables'])) {
        throw new Error('El JSON debe contener la propiedad "Result Tables" como un arreglo.');
      }

      const tablasNuevas: ResultTable[] = parsedJson['Result Tables'].map((t: any, index: number) => {
        if (!Array.isArray(t.columns) || !Array.isArray(t.rows)) {
          throw new Error(`Estructura inválida en la Tabla #${index + 1}. Debe incluir "columns" y "rows".`);
        }
        const equipmentId = t.equipment_id || this.certificado.equipment_id || '';
        return {
          title: t.title || '',
          equipment_id: equipmentId,
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
      this.sincronizarJsonTexto();
      this.mostrarAlerta('Las tablas han sido actualizadas desde el JSON correctamente.', false);
      this.cdr.detectChanges();
    } catch (err: any) {
      this.mostrarAlerta(`JSON Inválido: ${err.message}`, true);
    }
  }

  // --- Navegación mediante TAB ---
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

  // --- Gestión de Tablas ---
  agregarTabla(): void {
    this.resultTables.push(this.crearEstructuraTablaInicial());
    this.sincronizarJsonTexto();
  }

  eliminarTabla(indexTable: number): void {
    if (this.resultTables.length > 1) {
      this.resultTables.splice(indexTable, 1);
      this.sincronizarJsonTexto();
    }
  }

  // --- Gestión de Columnas ---
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
      this.mostrarAlerta(`Key inválido: ${resultado.mensaje}`, true);
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

  // --- Gestión de Filas ---
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

  // --- Construcción del JSON Limpio (estructura en inglés) ---
  obtenerJsonEstructurado(): object {
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

    return {
      "Result Tables": tablasProcesadas
    };
  }

  obtenerJsonString(): string {
    return JSON.stringify(this.obtenerJsonEstructurado(), null, 2);
  }

  copiarJson(): void {
    navigator.clipboard.writeText(this.jsonInputText).then(() => {
      this.copiadoExitoso = true;
      setTimeout(() => {
        this.copiadoExitoso = false;
        this.cdr.detectChanges();
      }, 2500);
    });
  }

  // --- Sistema de Validaciones (actualizado) ---
  validarFormulario(): boolean {
    if (!this.certificado.equipment_id || !this.certificado.equipment_id.trim()) {
      this.mostrarAlerta('El "ID del Equipo" es un campo obligatorio.', true);
      return false;
    }
    if (!this.certificado.name_equipment || !this.certificado.name_equipment.trim()) {
      this.mostrarAlerta('El "Nombre del Equipo" es un campo obligatorio.', true);
      return false;
    }
    if (this.certificado.date_cal && this.certificado.date_cc) {
      const fechaCal = new Date(this.certificado.date_cal);
      const fechaCc = new Date(this.certificado.date_cc);
      if (fechaCc < fechaCal) {
        this.mostrarAlerta('La "Fecha del Certificado" no puede ser anterior a la "Fecha de Calibración".', true);
        return false;
      }
    }

    for (let i = 0; i < this.resultTables.length; i++) {
      const table = this.resultTables[i];
      const numTable = i + 1;

      if (!table.title || !table.title.trim()) {
        this.mostrarAlerta(`El título de la Tabla #${numTable} es obligatorio.`, true);
        return false;
      }
      if (!table.parameter || !table.parameter.trim()) {
        this.mostrarAlerta(`El parámetro de la Tabla #${numTable} es obligatorio.`, true);
        return false;
      }

      const keys = table.columns.map(col => col.key.trim().toLowerCase().replace(/\s+/g, '_'));
      const uniqueKeys = new Set(keys);
      if (keys.length !== uniqueKeys.size) {
        this.mostrarAlerta(`La Tabla #${numTable} tiene columnas con keys duplicados.`, true);
        return false;
      }
      for (const col of table.columns) {
        const keyLimpio = col.key.trim().toLowerCase().replace(/\s+/g, '_');
        if (!keyLimpio) {
          this.mostrarAlerta(`La Tabla #${numTable} tiene una columna con key vacío.`, true);
          return false;
        }
        if (!/^[a-z0-9_]+$/.test(keyLimpio)) {
          this.mostrarAlerta(`La Tabla #${numTable} tiene un key con caracteres no permitidos: "${col.key}".`, true);
          return false;
        }
      }
    }
    return true;
  }

  mostrarAlerta(mensaje: string, esError: boolean): void {
    this.mensajeRespuesta = mensaje;
    this.esError = esError;
    this.cdr.detectChanges();

    if (esError) {
      setTimeout(() => {
        this.mensajeRespuesta = null;
        this.cdr.detectChanges();
      }, 5000);
    }
  }

  guardarCertificado(): void {
    if (!this.validarFormulario()) {
      return;
    }

    this.resultTables.forEach(table => {
      table.equipment_id = this.certificado.equipment_id;
    });
    this.sincronizarJsonTexto();

    const payload: Certificado = {
      ...this.certificado,
      equipment_id: this.certificado.equipment_id.trim(),
      name_equipment: this.certificado.name_equipment.trim(),
      data: this.obtenerJsonEstructurado()
    };

    const certId = this.certificado.id || this.id;

    if (!certId) {
      this.mostrarAlerta('No se pudo determinar el ID del certificado a actualizar.', true);
      return;
    }

    this.cargando = true;
    this.certificadoService.actualizarCertificado(certId, payload).subscribe({
      next: () => {
        this.cargando = false;
        this.guardandoExitoso = true;
        this.mostrarAlerta('¡Certificado actualizado correctamente! Redirigiendo ...', false);

        setTimeout(() => {
          this.router.navigate(['/listcert']);
        }, 2000);
      },
      error: (err: any) => {
        this.cargando = false;
        const msg = err.error?.message || 'Error al actualizar el certificado en la base de datos.';
        this.mostrarAlerta(msg, true);
      }
    });
  }

  cancelar(): void {
    this.router.navigate(['/listcert']);
  }
}
