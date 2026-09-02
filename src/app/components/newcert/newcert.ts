import {
  Component,
  OnInit,
  ChangeDetectorRef
} from '@angular/core';
import { Certificado } from '../../models/certificado.models';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TablaResultado, Columna } from '../../models/certificado.models';
import { CertService } from '../../services/cert.service';

export type DireccionTab = 'horizontal' | 'vertical';
export type JsonPrimitiveType = 'string' | 'number' | 'boolean';
export type TipoDato = 'number' | 'string';

@Component({
  selector: 'app-newcert',
  imports: [FormsModule, CommonModule],
  templateUrl: './newcert.html',
  styleUrl: './newcert.css',
})
export class Newcert implements OnInit {
  // Lista de opciones para el título
  opcionesTitulo: string[] = [
    'Tensión DC',
    'Tensión AC',
    'Corriente DC',
    'Corriente AC',
    'Resistencia',
    'Resistencia 4 hilos',
    'Tensión de impulsos (LI)(Tipo rayo)',
    'Tensión de impulsos (SI)(Tipo maniobra)',
    'Frecuencia',
    'Otro'
  ];

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

  tablasResultados: TablaResultado[] = [];
  direccionTab: DireccionTab = 'vertical';
  jsonInputText: string = '';
  mensajeRespuesta: string | null = null;
  esError: boolean = false;
  copiadoExitoso: boolean = false;

  constructor(
    private certificadoService: CertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.tablasResultados = [this.crearEstructuraTablaInicial()];
    this.sincronizarJsonTexto();
  }

  private crearEstructuraTablaInicial(): TablaResultado {
    return {
      titulo: 'Tensión DC',
      equipment_id: this.certificado.equipment_id || '',
      mesurando: '',
      unit: '',
      ecuation_calibration: '',
      range: '',
      columnas: [
        { key: 'key', label: 'Etiqueta', unit: 'Unidades', type: 'number' },
      ],
      filas: [{}]
    };
  }

  // --- Sincronización de JSON ---
  sincronizarJsonTexto(): void {
    this.jsonInputText = this.obtenerJsonString();
  }

  /**
   * Se llama desde cualquier cambio en la tabla o en el equipment_id global.
   * Actualiza el equipment_id en todas las tablas y regenera el JSON.
   */
  onTableChange(): void {
    this.tablasResultados.forEach(tabla => {
      tabla.equipment_id = this.certificado.equipment_id;
    });
    this.sincronizarJsonTexto();
  }

  /**
   * Determina si el título actual es uno de los predefinidos (excluyendo "Otro")
   */
  esTituloPredefinido(titulo: string): boolean {
    const predefinidos = this.opcionesTitulo.slice(0, -1);
    return predefinidos.includes(titulo);
  }

  /**
   * Valida que el key sea válido:
   * - No vacío después de sanitizar.
   * - Solo caracteres alfanuméricos y guión bajo.
   * - No duplicado en la misma tabla (excluyendo la columna actual si se proporciona).
   */
  private validarKey(key: string, tabla: TablaResultado, columnaActual?: Columna): { valido: boolean, mensaje?: string } {
    // Sanitizar: trim, minúsculas, espacios a guión bajo
    const keyLimpio = key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!keyLimpio) {
      return { valido: false, mensaje: 'El key no puede estar vacío.' };
    }
    // Permitir solo letras, números y guión bajo
    if (!/^[a-z0-9_]+$/.test(keyLimpio)) {
      return { valido: false, mensaje: 'El key solo puede contener letras, números y guión bajo.' };
    }
    // Verificar duplicados en la misma tabla (excluyendo la columna actual si se está editando)
    const columnas = tabla.columnas;
    for (const col of columnas) {
      if (columnaActual && col === columnaActual) continue;
      if (col.key === keyLimpio) {
        return { valido: false, mensaje: `El key "${keyLimpio}" ya existe en esta tabla.` };
      }
    }
    return { valido: true };
  }

  /**
   * Carga las tablas desde el JSON del textarea.
   */
  actualizarFormularioDesdeJson(): void {
    try {
      const parsedJson = JSON.parse(this.jsonInputText);
      if (!parsedJson || typeof parsedJson !== 'object' || !Array.isArray(parsedJson['Tablas de resultados'])) {
        throw new Error('El JSON debe contener la propiedad "Tablas de resultados" como un arreglo.');
      }

      const tablasNuevas: TablaResultado[] = parsedJson['Tablas de resultados'].map((t: any, index: number) => {
        if (!Array.isArray(t.columnas) || !Array.isArray(t.filas)) {
          throw new Error(`Estructura inválida en la Tabla #${index + 1}. Debe incluir "columnas" y "filas".`);
        }
        const equipmentId = t.equipment_id || this.certificado.equipment_id || '';
        return {
          titulo: t.titulo || '',
          equipment_id: equipmentId,
          mesurando: t.mesurando || '',
          unit: t.unit || '',
          ecuation_calibration: t.ecuation_calibration || '',
          range: t.range || '',
          columnas: t.columnas,
          filas: t.filas
        };
      });

      if (tablasNuevas.length === 0) {
        throw new Error('Debe incluir al menos una tabla de resultados en el JSON.');
      }

      this.tablasResultados = tablasNuevas;
      this.sincronizarJsonTexto();
      this.mostrarAlerta('Las tablas han sido actualizadas desde el JSON correctamente.', false);
      this.cdr.detectChanges();
    } catch (err: any) {
      this.mostrarAlerta(`JSON Inválido: ${err.message}`, true);
    }
  }

  // --- Navegación TAB ---
  onTabKeydown(event: Event, tablaIndex: number, filaIndex: number, colIndex: number): void {
    if (this.direccionTab === 'horizontal') return;
    const keyEvent = event as KeyboardEvent;
    keyEvent.preventDefault();
    const direction = keyEvent.shiftKey ? -1 : 1;
    const siguienteFilaIndex = filaIndex + direction;
    const targetId = `input-${tablaIndex}-${siguienteFilaIndex}-${colIndex}`;
    const targetInput = document.getElementById(targetId) as HTMLInputElement;
    if (targetInput) {
      targetInput.focus();
      targetInput.select();
    }
  }

  // --- Gestión de Tablas ---
  agregarTabla(): void {
    this.tablasResultados.push(this.crearEstructuraTablaInicial());
    this.sincronizarJsonTexto();
  }

  eliminarTabla(indexTabla: number): void {
    if (this.tablasResultados.length > 1) {
      this.tablasResultados.splice(indexTabla, 1);
      this.sincronizarJsonTexto();
    }
  }

  // --- Gestión de Columnas ---
  agregarColumna(tabla: TablaResultado): void {
    const id = tabla.columnas.length + 1;
    const nuevaKey = `columna_${id}`;
    tabla.columnas.push({
      key: nuevaKey,
      label: `Nueva Columna ${id}`,
      unit: '',
      type: 'number'
    });
    tabla.filas.forEach(fila => {
      fila[nuevaKey] = null;
    });
    this.sincronizarJsonTexto();
  }

  eliminarColumna(tabla: TablaResultado, indexColumna: number): void {
    if (tabla.columnas.length <= 1) return;
    const keyAEliminar = tabla.columnas[indexColumna].key;
    tabla.columnas.splice(indexColumna, 1);
    tabla.filas.forEach(fila => {
      delete fila[keyAEliminar];
    });
    this.sincronizarJsonTexto();
  }

  /**
   * Actualiza el key de una columna con validación.
   */
  actualizarKeyColumna(col: Columna, nuevaKeyRaw: string, tabla: TablaResultado): void {
    // Sanitizar
    const nuevaKey = nuevaKeyRaw.trim().toLowerCase().replace(/\s+/g, '_');
    const viejaKey = col.key;

    // Si no hay cambio o el key sanitizado es igual al viejo, no hacer nada
    if (!nuevaKey || nuevaKey === viejaKey) return;

    // Validar el nuevo key
    const resultado = this.validarKey(nuevaKey, tabla, col);
    if (!resultado.valido) {
      this.mostrarAlerta(`Key inválido: ${resultado.mensaje}`, true);
      // No actualizar, dejar el valor anterior en el input (se restablece)
      // Forzamos la actualización del input con el valor anterior
      col.key = viejaKey; // Esto no es necesario porque el binding se actualizará, pero mejor refrescar
      this.cdr.detectChanges();
      return;
    }

    // Aplicar el cambio
    col.key = nuevaKey;
    tabla.filas.forEach(fila => {
      fila[nuevaKey] = fila[viejaKey] ?? null;
      delete fila[viejaKey];
    });
    this.sincronizarJsonTexto();
  }

  cambiarTipoDato(col: Columna, tabla: TablaResultado): void {
    tabla.filas.forEach(fila => {
      fila[col.key] = null;
    });
    this.sincronizarJsonTexto();
  }

  // --- Gestión de Filas ---
  agregarFila(tabla: TablaResultado): void {
    const nuevaFila: Record<string, any> = {};
    tabla.columnas.forEach(col => {
      nuevaFila[col.key] = null;
    });
    tabla.filas.push(nuevaFila);
    this.sincronizarJsonTexto();
  }

  eliminarFila(tabla: TablaResultado, indexFila: number): void {
    if (tabla.filas.length > 1) {
      tabla.filas.splice(indexFila, 1);
      this.sincronizarJsonTexto();
    }
  }

  // --- Construcción del JSON Limpio (incluye equipment_id) ---
  obtenerJsonEstructurado(): object {
    const tablasProcesadas = this.tablasResultados.map(tabla => {
      const tiposPorKey: Record<string, TipoDato> = {};
      tabla.columnas.forEach(col => {
        tiposPorKey[col.key] = col.type;
      });

      const filasProcesadas = tabla.filas.map(fila => {
        const nuevaFila: Record<string, any> = {};
        Object.keys(fila).forEach(key => {
          const valorRaw = fila[key];
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
        titulo: tabla.titulo || '',
        equipment_id: this.certificado.equipment_id,
        mesurando: tabla.mesurando || '',
        unit: tabla.unit || '',
        ecuation_calibration: tabla.ecuation_calibration || '',
        range: tabla.range || '',
        columnas: tabla.columnas,
        filas: filasProcesadas
      };
    });

    return {
      "Tablas de resultados": tablasProcesadas
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

  // --- Validaciones del formulario ---
  validarFormulario(): boolean {
    // Validar campos del certificado
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

    // Validar tablas
    for (let i = 0; i < this.tablasResultados.length; i++) {
      const tabla = this.tablasResultados[i];
      const numTabla = i + 1;

      if (!tabla.titulo || !tabla.titulo.trim()) {
        this.mostrarAlerta(`El título de la Tabla #${numTabla} es obligatorio.`, true);
        return false;
      }
      if (!tabla.mesurando || !tabla.mesurando.trim()) {
        this.mostrarAlerta(`El mesurando de la Tabla #${numTabla} es obligatorio.`, true);
        return false;
      }

      // Validar keys de columnas
      const keys = tabla.columnas.map(col => col.key.trim().toLowerCase().replace(/\s+/g, '_'));
      const uniqueKeys = new Set(keys);
      if (keys.length !== uniqueKeys.size) {
        this.mostrarAlerta(`La Tabla #${numTabla} tiene columnas con keys duplicados.`, true);
        return false;
      }
      for (const col of tabla.columnas) {
        const keyLimpio = col.key.trim().toLowerCase().replace(/\s+/g, '_');
        if (!keyLimpio) {
          this.mostrarAlerta(`La Tabla #${numTabla} tiene una columna con key vacío.`, true);
          return false;
        }
        if (!/^[a-z0-9_]+$/.test(keyLimpio)) {
          this.mostrarAlerta(`La Tabla #${numTabla} tiene un key con caracteres no permitidos: "${col.key}".`, true);
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
    setTimeout(() => {
      this.mensajeRespuesta = null;
      this.cdr.detectChanges();
    }, 5000);
  }

  guardarCertificado(): void {
    if (!this.validarFormulario()) {
      return;
    }

    this.tablasResultados.forEach(tabla => {
      tabla.equipment_id = this.certificado.equipment_id;
    });
    this.sincronizarJsonTexto();

    const payload: Certificado = {
      ...this.certificado,
      equipment_id: this.certificado.equipment_id.trim(),
      name_equipment: this.certificado.name_equipment.trim(),
      data: this.obtenerJsonEstructurado()
    };

    this.certificadoService.crearCertificado(payload).subscribe({
      next: (res: any) => {
        this.mostrarAlerta('¡Certificado guardado correctamente!', false);
        this.limpiarFormulario();
      },
      error: (err: any) => {
        const msg = err.error?.message || 'Error al conectar con la API de PostgreSQL.';
        this.mostrarAlerta(msg, true);
      }
    });
  }

  limpiarFormulario(): void {
    this.certificado = {
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
    this.tablasResultados = [this.crearEstructuraTablaInicial()];
    this.sincronizarJsonTexto();
    this.cdr.detectChanges();
  }
}
