import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CertService } from '../../../services/database/cert.service';
import { Certificado, ApiResponse, CertificadoData } from '../../../models/cert.auth.models';
import { AlertService } from '../../../services/core/alert.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-admincert',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './admincert.html',
  styleUrl: './admincert.css',
})
export class admincert implements OnInit {

  private readonly alert = inject(AlertService);
  private readonly PASSWORD = 'admin';

  listaCertificados: Certificado[] = [];
  cargando = false;
  textoBusqueda = '';
  filtroEstado: 'todos' | 'activos' | 'inactivos' = 'todos';

  private eliminando: Set<string | number> = new Set();
  generandoReporte = false;

  // Controla qué fila está expandida para mostrar el panel de opciones
  idExpandido: number | string | null = null;

  constructor(
    private certService: CertService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.verificarPassword();
  }

  async verificarPassword(): Promise<void> {
    const pass = await this.alert.prompt(
      'Ingrese la contraseña para acceder a la administración de certificados.',
      'Acceso restringido',
      { type: 'question', confirmText: 'Acceder', cancelText: 'Cancelar', dismissible: false, prompt: { placeholder: 'Contraseña…', defaultValue: '', inputType: 'password' } }
    );

    if (pass === null) {
      this.alert.info('Acceso cancelado.', 'Saliendo');
      this.router.navigate(['/listcert']);
      return;
    }

    if (pass === this.PASSWORD) {
      this.alert.success('Acceso concedido.', 'Bienvenido');
      this.obtenerCertificados();
    } else {
      this.alert.error('Contraseña incorrecta. Acceso denegado.', 'Acceso denegado');
      this.router.navigate(['/listcert']);
    }
  }

  obtenerCertificados(): void {
    this.cargando = true;
    this.cdr.detectChanges();

    this.certService.obtenerCertificados().subscribe({
      next: (res: ApiResponse<Certificado[]>) => {
        if (res && res.ok && Array.isArray(res.data)) {
          this.listaCertificados = res.data;
        } else if (Array.isArray(res)) {
          this.listaCertificados = res as unknown as Certificado[];
        } else {
          this.listaCertificados = [];
        }

        this.cargando = false;
        this.cdr.detectChanges();

        if (this.listaCertificados.length > 0) {
          this.alert.success(`Se cargaron ${this.listaCertificados.length} certificados.`, 'Lista actualizada');
        } else {
          this.alert.info('No hay certificados registrados todavía.', 'Sin datos');
        }
      },
      error: (err: any) => {
        console.error('Error al obtener certificados:', err);
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.error(err.error?.message || 'Error al conectar con la base de datos.', 'Error');
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LÓGICA DE UI (Panel de opciones)
  // ───────────────────────────────────────────────────────────────────────────
  toggleDetalle(id: number | string | undefined): void {
    if (!id) return;
    this.idExpandido = this.idExpandido === id ? null : id;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GETTERS Y HELPERS LÓGICOS
  // ───────────────────────────────────────────────────────────────────────────
  esActivo(cert: Certificado): boolean {
    return cert.active === true || Number(cert.active) === 1;
  }

  get certificadosFiltrados(): Certificado[] {
    return this.listaCertificados.filter((cert) => {
      const isActivo = this.esActivo(cert);
      if (this.filtroEstado === 'activos' && !isActivo) return false;
      if (this.filtroEstado === 'inactivos' && isActivo) return false;

      if (!this.textoBusqueda.trim()) return true;

      const termino = this.textoBusqueda.toLowerCase().trim();
      return (
        (cert.equipment_id?.toLowerCase().includes(termino)) ||
        (cert.id ? String(cert.id).toLowerCase().includes(termino) : false) ||
        (cert.cc?.toLowerCase().includes(termino)) ||
        (cert.name_equipment?.toLowerCase().includes(termino))
      );
    });
  }

  contarActivos(): number {
    return this.certificadosFiltrados.filter(c => this.esActivo(c)).length;
  }

  contarInactivos(): number {
    return this.certificadosFiltrados.filter(c => !this.esActivo(c)).length;
  }

  contarSinAuditoria(): number {
    return this.certificadosFiltrados.filter(c => !c.updated_at && !c.created_at).length;
  }

  diasDesde(value?: string | null): number {
    if (!value) return 0;
    const d = new Date(value).getTime();
    if (isNaN(d)) return 0;
    return Math.max(0, Math.floor((Date.now() - d) / 86400000));
  }

  claseDias(dias: number): string {
    if (dias < 30) return 'text-success';
    if (dias < 365) return 'text-warning';
    return 'text-danger';
  }

  formatFechaCompleta(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  formatFechaCorta(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  trackByCertId(index: number, cert: Certificado): number | string {
    return cert.id ?? index;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ELIMINAR
  // ───────────────────────────────────────────────────────────────────────────
  async eliminarCertificado(id: number | string | undefined): Promise<void> {
    if (!id) return;
    this.idExpandido = null;
    if (this.eliminando.has(id)) return;

    const cert = this.listaCertificados.find(c => c.id === id);
    const identificador = cert ? (cert.cc || cert.equipment_id || id) : id;

    const confirmado = await this.alert.confirm(
      `Se eliminará permanentemente el certificado "${identificador}". Esta acción no se puede deshacer.`,
      'Eliminar certificado',
      { type: 'error', confirmText: 'Sí, eliminar', cancelText: 'Cancelar', dismissible: false }
    );

    if (!confirmado) return;

    this.eliminando.add(id);
    this.cargando = true;
    this.cdr.detectChanges();

    this.certService.eliminarCertificado(id).subscribe({
      next: () => {
        this.listaCertificados = this.listaCertificados.filter(c => c.id !== id);
        this.eliminando.delete(id);
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.success(`Certificado "${identificador}" eliminado correctamente.`, 'Eliminado');
      },
      error: (err: any) => {
        console.error('Error al eliminar:', err);
        this.eliminando.delete(id);
        this.cargando = false;
        this.cdr.detectChanges();
        this.alert.error(err.error?.message || 'No se pudo eliminar el certificado.', 'Error al eliminar');
      },
    });
  }

  volver(): void {
    this.router.navigate(['/list-cert']);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // HELPERS INTERNOS PARA PDF
  // ───────────────────────────────────────────────────────────────────────────
  private async getLogoBase64(): Promise<string | null> {
    try {
      const response = await fetch('/logo.png');
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('No se pudo cargar el logo', e);
      return null;
    }
  }

  private contarPor(datos: Certificado[], campo: 'created_by' | 'updated_by'): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const c of datos) {
      const raw = c[campo];
      const user = (raw && String(raw).trim()) || '(sin registro)';
      mapa.set(user, (mapa.get(user) || 0) + 1);
    }
    return mapa;
  }

  private topN(mapa: Map<string, number>, n: number): Array<[string, number]> {
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // REPORTE GENERAL (Todos los certificados)
  // ───────────────────────────────────────────────────────────────────────────
  async generarReporteGeneral(): Promise<void> {
    if (this.generandoReporte) return;
    const datos = this.certificadosFiltrados;
    if (datos.length === 0) {
      this.alert.warning('No hay certificados para incluir en el reporte.', 'Sin datos');
      return;
    }

    this.generandoReporte = true;
    this.cdr.detectChanges();

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const ahora = new Date();
      const logoBase64 = await this.getLogoBase64();

      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 250, 10, 30, 15);
      }

      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text('Reporte General de Certificados', 14, 20);

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generado: ${ahora.toLocaleString('es-MX')}`, 14, 26);
      doc.text(`Filtro de estado: ${this.filtroEstado}`, 14, 31);
      doc.text(`Total de registros: ${datos.length}`, 14, 36);

      const activos = datos.filter(c => this.esActivo(c)).length;
      const inactivos = datos.length - activos;
      const sinAuditoria = datos.filter(c => !c.updated_at && !c.created_at).length;

      const usuariosCreadores = this.contarPor(datos, 'created_by');
      const usuariosModificadores = this.contarPor(datos, 'updated_by');

      autoTable(doc, {
        startY: 42,
        head: [['Resumen', 'Valor']],
        body: [
          ['Activos', String(activos)],
          ['Inactivos', String(inactivos)],
          ['Sin datos de auditoría', String(sinAuditoria)],
          ['Usuarios creadores distintos', String(usuariosCreadores.size)],
          ['Usuarios modificadores distintos', String(usuariosModificadores.size)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold' }, // Negro
        styles: { fontSize: 9, cellPadding: 2 },
        margin: { left: 14, right: 14 },
      });

      const afterResumenY = (doc as any).lastAutoTable.finalY + 6;

      autoTable(doc, {
        startY: afterResumenY,
        head: [['Top creadores', 'Certificados']],
        body: this.topN(usuariosCreadores, 5).map(([u, n]) => [u, String(n)]),
        theme: 'striped',
        headStyles: { fillColor: [80, 80, 80], textColor: 255 }, // Gris
        margin: { left: 14, right: 14 },
        tableWidth: 80,
      });

      autoTable(doc, {
        startY: afterResumenY,
        head: [['Top modificadores', 'Certificados']],
        body: this.topN(usuariosModificadores, 5).map(([u, n]) => [u, String(n)]),
        theme: 'striped',
        headStyles: { fillColor: [220, 38, 38], textColor: 255 }, // Rojo
        margin: { left: 100, right: 14 },
        tableWidth: 80,
      });

      const startTablaDetalleY = (doc as any).lastAutoTable.finalY + 8;

      autoTable(doc, {
        startY: startTablaDetalleY,
        head: [['ID', 'CC', 'Equipment ID', 'Nombre del equipo', 'Estado', 'Creado', 'Creado por', 'Modificado', 'Modificado por', 'Días sin cambio']],
        body: datos.map(c => [
          String(c.id ?? ''), c.cc ?? '', c.equipment_id ?? '', c.name_equipment ?? '',
          this.esActivo(c) ? 'Activo' : 'Inactivo',
          this.formatFechaCorta(c.created_at), c.created_by ?? '—',
          this.formatFechaCorta(c.updated_at), c.updated_by ?? '—',
          c.updated_at ? String(this.diasDesde(c.updated_at)) : '—',
        ]),
        theme: 'grid',
        headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 22 }, 2: { cellWidth: 28 }, 3: { cellWidth: 40 }, 4: { cellWidth: 16 }, 5: { cellWidth: 26 }, 6: { cellWidth: 24 }, 7: { cellWidth: 26 }, 8: { cellWidth: 24 }, 9: { cellWidth: 18, halign: 'center' } },
        margin: { left: 14, right: 14 },
      });

      const totalPages = doc.getNumberOfPages();
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
        doc.text('Sistema de Gestión de Certificados — Reporte generado automáticamente', 14, pageHeight - 6);
      }

      doc.save(`Auditoria_General_${ahora.toISOString().slice(0, 10)}.pdf`);
      this.alert.success('Reporte general generado.', 'PDF listo');
    } catch (err) {
      console.error('Error al generar el reporte general:', err);
      this.alert.error('No se pudo generar el reporte.', 'Error');
    } finally {
      this.generandoReporte = false;
      this.cdr.detectChanges();
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // REPORTE INDIVIDUAL (Un solo certificado con tablas y modificaciones)
  // ───────────────────────────────────────────────────────────────────────────
  async generarReporteIndividual(cert: Certificado): Promise<void> {
    this.idExpandido = null;
    if (this.generandoReporte || !cert) return;

    this.generandoReporte = true;
    this.cdr.detectChanges();

    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const ahora = new Date();
      const logoBase64 = await this.getLogoBase64();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Encabezado con Logo
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 160, 10, 30, 15);
      }

      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text('Reporte de Certificado', 14, 20);

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generado: ${ahora.toLocaleString('es-MX')}`, 14, 26);

      // ── Detalles del Certificado ──
      const infoCert = [
        ['Folio / CC', cert.cc || 'N/A'],
        ['Equipment ID', cert.equipment_id || 'N/A'],
        ['Nombre del Equipo', cert.name_equipment || 'N/A'],
        ['Estado', this.esActivo(cert) ? 'Activo' : 'Inactivo'],
        ['F. Calibración', cert.date_cal || 'N/A'],
        ['F. Certificado', cert.date_cc || 'N/A'],
        ['Entidad', cert.entity || 'N/A'],
        ['Tipo', cert.cert_type || 'N/A'],
        ['Comentarios', cert.comments || 'N/A'],
      ];

      autoTable(doc, {
        startY: 32,
        head: [['Información del Certificado', 'Detalle']],
        body: infoCert,
        theme: 'grid',
        headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold' }, // Negro/Gris oscuro
        styles: { fontSize: 9, cellPadding: 2, textColor: [30, 30, 30] },
        margin: { left: 14, right: 14 },
      });

      // ── Sección de Auditoría ──
      let currentY = (doc as any).lastAutoTable.finalY + 8;

      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text('Historial de Auditoría', 14, currentY);

      const infoAuditoria = [
        ['Fecha de Creación', this.formatFechaCorta(cert.created_at)],
        ['Creado por', cert.created_by || '—'],
        ['Última Modificación', this.formatFechaCorta(cert.updated_at)],
        ['Modificado por', cert.updated_by || '—'],
      ];

      autoTable(doc, {
        startY: currentY + 4,
        head: [['Evento', 'Detalle']],
        body: infoAuditoria,
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' }, // Rojo para auditoría
        styles: { fontSize: 9, cellPadding: 2, textColor: [30, 30, 30] },
        margin: { left: 14, right: 14 },
      });

      // ── Sección de Tablas de Resultados ──
      currentY = (doc as any).lastAutoTable.finalY + 8;
      const certData = cert.data as CertificadoData;
      const resultTables = certData?.['Result Tables'] || [];

      if (resultTables.length > 0) {
        doc.setFontSize(12);
        doc.setTextColor(30, 41, 59);
        doc.text('Tablas de Resultados', 14, currentY);
        currentY += 6;

        for (let index = 0; index < resultTables.length; index++) {
          const tabla = resultTables[index];

          // 1. Extraer metadata
          const titulo = `${index + 1}. ${tabla.title || 'Tabla de Resultados'}`;

          const detailsList: string[] = [
            `Parámetro: ${tabla.parameter || 'N/A'} | Unidad: ${tabla.unit || 'N/A'} | Rango: ${tabla.range || 'N/A'}`,
            `Ecuación: ${tabla.calibration_equation || 'N/A'}`
          ];

          if (tabla.comments) {
            detailsList.push(`Comentarios: ${tabla.comments}`);
          }

          // 2. Preparar los headers y rows
          const headers = tabla.columns?.map(col => {
            let title = col.label || col.key;
            if (col.unit) title += ` (${col.unit})`;
            return title;
          }) || [];

          const body = tabla.rows?.map(row =>
            tabla.columns?.map(col => String(row[col.key] !== undefined && row[col.key] !== null ? row[col.key] : ''))
          ) || [];

          // 3. Calcular altura del texto descriptivo con splitTextToSize
          const maxAnchoTexto = doc.internal.pageSize.getWidth() - 28; // 14 de margen izq + 14 der
          let lineasMetadata: string[] = [];

          detailsList.forEach(texto => {
            const lineas = doc.splitTextToSize(texto, maxAnchoTexto);
            lineasMetadata.push(...lineas);
          });

          // Calcular altura estimada total (Título + Metadata + Tabla)
          const estimatedHeight = 10 + (lineasMetadata.length * 4) + (body.length * 5) + 10;

          // 4. Si no cabe en la página actual, saltamos ANTES de dibujar para evitar hojas en blanco
          if (currentY + estimatedHeight > pageHeight - 15) {
            doc.addPage();
            currentY = 20;
          }

          // 5. Dibujar Título
          doc.setFontSize(10);
          doc.setTextColor(30, 30, 30);
          doc.setFont('helvetica', 'bold');
          doc.text(titulo, 14, currentY);
          currentY += 5;

          // 6. Dibujar Metadata (Comentarios, Parámetros, etc.)
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(80, 80, 80);

          lineasMetadata.forEach(linea => {
            doc.text(linea, 14, currentY);
            currentY += 4;
          });

          currentY += 3; // Espacio extra antes de la tabla

          // 7. Dibujar la tabla de datos
          if (headers.length > 0 && body.length > 0) {
            autoTable(doc, {
              startY: currentY,
              head: [headers],
              body: body,
              theme: 'grid',
              headStyles: { fillColor: [80, 80, 80], textColor: 255, fontSize: 8 }, // Gris medio
              styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak', textColor: [30, 30, 30] },
              alternateRowStyles: { fillColor: [245, 245, 245] }, // Gris muy claro para filas
              margin: { left: 14, right: 14 },
            });
            currentY = (doc as any).lastAutoTable.finalY + 10; // Espacio después de la tabla
          } else {
            doc.setFontSize(9);
            doc.setTextColor(150, 150, 150);
            doc.text('Sin registros en esta tabla.', 18, currentY);
            currentY += 10;
          }
        }
      } else {
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text('Este certificado no cuenta con tablas de resultados registradas.', 14, currentY);
      }

      // Pie de página (Solo en las páginas usadas)
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Página ${i} de ${totalPages}`, doc.internal.pageSize.getWidth() - 14, pageHeight - 6, { align: 'right' });
      }

      doc.save(`Certificado_${cert.cc || cert.id || 'sin_id'}.pdf`);
      this.alert.success('Reporte individual generado.', 'PDF listo');

    } catch (err) {
      console.error('Error al generar el reporte individual:', err);
      this.alert.error('No se pudo generar el reporte.', 'Error');
    } finally {
      this.generandoReporte = false;
      this.cdr.detectChanges();
    }
  }
}
