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
    range: '',
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
      columnas: [
        { key: 'valor_referencia', label: 'Valor de Referencia', unit: '', type: 'number' },
        { key: 'resultado', label: 'Resultado', unit: '%', type: 'number' },
        { key: 'valor_medido', label: 'Valor Medido', unit: '', type: 'number' },
        { key: 'incertidumbre', label: 'Incertidumbre', unit: '', type: 'number' }
      ],
      filas: [
        { valor_referencia: null, resultado: null, valor_medido: null, incertidumbre: null },
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

  // --- Comunicación con el Servicio para Crear Certificado ---
  guardarCertificado(): void {
    if (!this.certificado.equipment_id.trim() || !this.certificado.name_equipment.trim()) {
      this.esError = true;
      this.mensajeRespuesta = 'El ID del Equipo y el Nombre son obligatorios.';
      return;
    }

    this.cargando = true;
    this.mensajeRespuesta = null;
    this.esError = false;

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
        this.esError = true;
        this.mensajeRespuesta = err.error?.message || 'Error al conectar con el servidor';
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
      range: '',
      active: true,
      data: {}
    };
    this.tablasResultados = [this.crearEstructuraTablaInicial()];
  }
}
