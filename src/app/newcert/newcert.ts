import {
  Component,
  OnInit,
  ChangeDetectorRef
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

  // Control de alertas de la interfaz
  mensajeRespuesta: string | null = null;
  esError: boolean = false;
  copiadoExitoso: boolean = false;

  constructor(
    private certificadoService: CertService,
    private cdr: ChangeDetectorRef // <--- Inyectamos ChangeDetectorRef para forzar el renderizado
  ) {}

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
        titulo: tabla.titulo || '',
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
    navigator.clipboard.writeText(this.obtenerJsonString()).then(() => {
      this.copiadoExitoso = true;
      setTimeout(() => {
        this.copiadoExitoso = false;
        this.cdr.detectChanges();
      }, 2500);
    });
  }

  // --- Sistema de Validaciones ---
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
    }

    return true;
  }

  mostrarAlerta(mensaje: string, esError: boolean): void {
    this.mensajeRespuesta = mensaje;
    this.esError = esError;
    this.cdr.detectChanges(); // Forzar actualización visual del DOM

    setTimeout(() => {
      this.mensajeRespuesta = null;
      this.cdr.detectChanges();
    }, 5000);
  }

  // --- Guardado Seguro con Forzado de Detección de Cambios ---
  guardarCertificado(): void {
    if (!this.validarFormulario()) {
      return;
    }

    const payload: Certificado = {
      ...this.certificado,
      equipment_id: this.certificado.equipment_id.trim(),
      name_equipment: this.certificado.name_equipment.trim(),
      data: JSON.parse(JSON.stringify(this.obtenerJsonEstructurado()))
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
    // Reasignamos nuevas referencias para romper cualquier binding previo en Angular
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

    // Forzamos la detección de cambios para actualizar el HTML inmediatamente
    this.cdr.detectChanges();
  }
}
