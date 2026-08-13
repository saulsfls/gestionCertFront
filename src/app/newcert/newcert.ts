import {
  Component,
  OnInit,
} from '@angular/core';
import { Certificado } from '../models/certificado.models';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TablaResultado, Columna } from '../models/certificado.models';
import { CertService } from '../services/cert.service';
export type DireccionTab = 'horizontal' | 'vertical';
export type JsonPrimitiveType = 'string' | 'number' | 'boolean';
export type TipoDato = 'number' | 'string';
@Component({
  selector: 'app-newcert',
  imports: [FormsModule, CommonModule],
  templateUrl: './newcert.html',
  styleUrl: './newcert.css',
})
export class Newcert {
 // 1. Formulario del certificado
  certificado: Certificado = {
    equipment_id: '',
    name_equipment: '',
    cc: '',
    date_cal: '',
    date_cc: '',
    mesureament: '',
    comments: '',
    active: true,
    data: {}
  };

  // 2. Control de Tablas Dinámicas
  tablasResultados: TablaResultado[] = [];
  direccionTab: DireccionTab = 'vertical';

  // Control de interfaz
  copiadoExitoso: boolean = false;
  cargando: boolean = false;
  mensajeRespuesta: string | null = null;
  esError: boolean = false;

  constructor(private certificadoService: CertService) {}

  ngOnInit(): void {
    this.tablasResultados = [this.crearEstructuraTablaInicial()];
  }

  private crearEstructuraTablaInicial(): TablaResultado {
    return {
      titulo: '',
      mesurando: '',
      unit: '',
      ecuation_calibration: '',
      range: '',
      columnas: [
        { key: 'key', label: 'etiqueta', unit: '', type: 'number' },
      ],
      filas: [
        { valor_referencia: null, resultado: null, valor_medido: null, incertidumbre: null }
      ]
    };
  }

  // --- Navegación mediante TAB ---
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
  }

  eliminarTabla(indexTabla: number): void {
    if (this.tablasResultados.length > 1) {
      this.tablasResultados.splice(indexTabla, 1);
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
  }

  eliminarColumna(tabla: TablaResultado, indexColumna: number): void {
    if (tabla.columnas.length <= 1) return;

    const keyAEliminar = tabla.columnas[indexColumna].key;
    tabla.columnas.splice(indexColumna, 1);

    tabla.filas.forEach(fila => {
      delete fila[keyAEliminar];
    });
  }

  actualizarKeyColumna(col: Columna, nuevaKeyRaw: string, tabla: TablaResultado): void {
    const nuevaKey = nuevaKeyRaw.trim().toLowerCase().replace(/\s+/g, '_');
    const viejaKey = col.key;

    if (!nuevaKey || viejaKey === nuevaKey) return;

    col.key = nuevaKey;

    tabla.filas.forEach(fila => {
      fila[nuevaKey] = fila[viejaKey] ?? null;
      delete fila[viejaKey];
    });
  }

  cambiarTipoDato(col: Columna, tabla: TablaResultado): void {
    tabla.filas.forEach(fila => {
      fila[col.key] = null;
    });
  }

  // --- Gestión de Filas ---
  agregarFila(tabla: TablaResultado): void {
    const nuevaFila: Record<string, any> = {};
    tabla.columnas.forEach(col => {
      nuevaFila[col.key] = null;
    });
    tabla.filas.push(nuevaFila);
  }

  eliminarFila(tabla: TablaResultado, indexFila: number): void {
    if (tabla.filas.length > 1) {
      tabla.filas.splice(indexFila, 1);
    }
  }

  // --- Construcción del JSON Limpio ---
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
        ...tabla,
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
    navigator.clipboard.writeText(this.obtenerJsonString()).then(() => {
      this.copiadoExitoso = true;
      setTimeout(() => (this.copiadoExitoso = false), 2500);
    });
  }

  // --- Sistema de Validaciones ---
  validarFormulario(): boolean {
    // 1. Validar Campos Principales del Certificado
    if (!this.certificado.equipment_id || !this.certificado.equipment_id.trim()) {
      this.mostrarError('El "ID del Equipo" es un campo obligatorio.');
      return false;
    }

    if (!this.certificado.name_equipment || !this.certificado.name_equipment.trim()) {
      this.mostrarError('El "Nombre del Equipo" es obligatorio.');
      return false;
    }

    // 2. Validar Fechas (date_cc no puede ser previa a date_cal)
    if (this.certificado.date_cal && this.certificado.date_cc) {
      const fechaCal = new Date(this.certificado.date_cal);
      const fechaCc = new Date(this.certificado.date_cc);

      if (fechaCc < fechaCal) {
        this.mostrarError('La "Fecha del Certificado" no puede ser anterior a la "Fecha de Calibración".');
        return false;
      }
    }

    // 3. Validar Estructura de Tablas Dinámicas
    for (let i = 0; i < this.tablasResultados.length; i++) {
      const tabla = this.tablasResultados[i];
      const numTabla = i + 1;

      if (!tabla.titulo || !tabla.titulo.trim()) {
        this.mostrarError(`El título de la Tabla #${numTabla} es obligatorio.`);
        return false;
      }

      if (!tabla.mesurando || !tabla.mesurando.trim()) {
        this.mostrarError(`El mesurando de la Tabla #${numTabla} es obligatorio.`);
        return false;
      }

      // Validar Columnas (Etiquetas no vacías y sin duplicados)
      const labels = tabla.columnas.map(col => col.label.trim().toLowerCase());
      if (labels.some(label => !label)) {
        this.mostrarError(`La Tabla #${numTabla} tiene columnas con títulos vacíos.`);
        return false;
      }

      const tieneDuplicados = labels.some((label, idx) => labels.indexOf(label) !== idx);
      if (tieneDuplicados) {
        this.mostrarError(`La Tabla #${numTabla} contiene nombres de columnas duplicados.`);
        return false;
      }

      // Validar Filas (Evitar tablas con todas las celdas nulas o vacías)
      const tieneAlgunaCeldaConDatos = tabla.filas.some(fila =>
        Object.values(fila).some(val => val !== null && val !== undefined && val !== '')
      );

      if (!tieneAlgunaCeldaConDatos) {
        this.mostrarError(`La Tabla #${numTabla} no tiene ningún dato ingresado en sus filas.`);
        return false;
      }
    }

    return true;
  }

  private mostrarError(mensaje: string): void {
    this.esError = true;
    this.mensajeRespuesta = mensaje;
  }

  // --- Comunicación con el Servicio para Crear Certificado ---
  guardarCertificado(): void {
    this.mensajeRespuesta = null;
    this.esError = false;

    // Ejecutar validaciones antes de procesar o enviar
    if (!this.validarFormulario()) {
      return;
    }

    this.cargando = true;

    // Asignar el JSON construido dinámicamente al campo 'data'
    this.certificado.data = this.obtenerJsonEstructurado();

    this.certificadoService.crearCertificado(this.certificado).subscribe({
      next: (res) => {
        this.cargando = false;
        if (res.ok) {
          this.esError = false;
          this.mensajeRespuesta = '¡Certificado guardado con éxito!';
          console.log('Respuesta del Servidor:', res.data);
          this.limpiarFormulario();
        }
      },
      error: (err) => {
        this.cargando = false;
        this.mostrarError(err.error?.message || 'Error al conectar con el servidor.');
        console.error('Error al guardar certificado:', err);
      }
    });
  }

  private limpiarFormulario(): void {
    this.certificado = {
      equipment_id: '',
      name_equipment: '',
      cc: '',
      date_cal: '',
      date_cc: '',
      mesureament: '',
      comments: '',
      active: true,
      data: {}
    };
    this.tablasResultados = [this.crearEstructuraTablaInicial()];
  }
}
