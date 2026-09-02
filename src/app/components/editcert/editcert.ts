import {
  Component,
  OnInit,
  Input,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Certificado, TablaResultado, Columna } from '../../models/certificado.models';
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

  // 2. Control de Tablas Dinámicas y Vista
  tablasResultados: TablaResultado[] = [];
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

        // Cargar tablas desde el data del certificado
        if (certData.data && certData.data['Tablas de resultados']) {
          this.tablasResultados = certData.data['Tablas de resultados'].map((tabla: any) => {
            // Asegurar que cada tabla tenga equipment_id (si no, asignar del certificado)
            return {
              ...tabla,
              equipment_id: tabla.equipment_id || tabla.id_equipment || this.certificado.equipment_id || ''
            };
          });
        } else {
          this.tablasResultados = [this.crearEstructuraTablaInicial()];
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
    const keyLimpio = key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!keyLimpio) {
      return { valido: false, mensaje: 'El key no puede estar vacío.' };
    }
    if (!/^[a-z0-9_]+$/.test(keyLimpio)) {
      return { valido: false, mensaje: 'El key solo puede contener letras, números y guión bajo.' };
    }
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
   * Asigna equipment_id a cada tabla tomando el valor del certificado si no viene en el JSON.
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
        const equipmentId = t.equipment_id || t.id_equipment || this.certificado.equipment_id || '';
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
    const nuevaKey = nuevaKeyRaw.trim().toLowerCase().replace(/\s+/g, '_');
    const viejaKey = col.key;
    if (!nuevaKey || nuevaKey === viejaKey) return;

    const resultado = this.validarKey(nuevaKey, tabla, col);
    if (!resultado.valido) {
      this.mostrarAlerta(`Key inválido: ${resultado.mensaje}`, true);
      col.key = viejaKey; // Restaurar el valor anterior
      this.cdr.detectChanges();
      return;
    }

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
        equipment_id: this.certificado.equipment_id, // Siempre se incluye
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

  // --- Sistema de Validaciones ---
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

    // Asegurar que todas las tablas tengan el equipment_id actualizado
    this.tablasResultados.forEach(tabla => {
      tabla.equipment_id = this.certificado.equipment_id;
    });
    this.sincronizarJsonTexto();

    const payload: Certificado = {
      ...this.certificado,
      equipment_id: this.certificado.equipment_id.trim(),
      name_equipment: this.certificado.name_equipment.trim(),
      data: this.obtenerJsonEstructurado() // fuente única de verdad
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
          this.router.navigate(['/viewcert']);
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
    this.router.navigate(['/viewcert']);
  }
}
