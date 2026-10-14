import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CmcPayload, CmcResultado } from '../../../models/cmc.model';
import { CmcCalculatorService } from '../../../services/cmc-calculator.service';
import { AlertService } from '../../../services/alert.service';

interface CmcCalculado {
  payload: CmcPayload;
  resultado: CmcResultado;
  error?: string;
}

@Component({
  selector: 'app-cmcsr',
  imports: [CommonModule, FormsModule],
  templateUrl: './cmcsr.html',
  styleUrl: './cmcsr.css',
})
export class Cmcsr implements OnChanges {
   /** Puede recibir uno o varios CMC. */
  @Input() cmcs: CmcPayload[] = [];
  @Input() titulo = '';
  @Input() mostrarEncabezado = true;

  @Output() calculado = new EventEmitter<CmcResultado[]>();
  @Output() cerrado = new EventEmitter<void>();

  resultados: CmcCalculado[] = [];
  cmcActivoId: number | null = null;
  copiado = false;

  private readonly calc = inject(CmcCalculatorService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);

  get cmcActivo(): CmcCalculado | undefined {
    return this.resultados.find(r => r.payload.cmcNumero === this.cmcActivoId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cmcs']) {
      this.recalcular();
    }
  }

  recalcular(): void {
    this.resultados = (this.cmcs ?? []).map(payload => {
      try {
        return { payload, resultado: this.calc.calcular(payload) };
      } catch (e: any) {
        return {
          payload,
          resultado: null as any,
          error: e?.message ?? 'Error desconocido',
        };
      }
    });

    if (this.resultados.length) {
      const actual = this.resultados.find(r => r.payload.cmcNumero === this.cmcActivoId);
      this.cmcActivoId = actual
        ? actual.payload.cmcNumero
        : this.resultados[0].payload.cmcNumero;
    }

    this.calculado.emit(
      this.resultados.filter(r => !!r.resultado).map(r => r.resultado)
    );

    this.refresh();
  }

  seleccionarCmc(id: number): void {
    this.cmcActivoId = id;
    this.refresh();
  }


  fmt(n: number | null | undefined, digitos = 6): string {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return n.toFixed(digitos);
  }

  fmtPct(n: number): string {
    return `${n.toFixed(2)} %`;
  }

  copiarResultados(): void {
    const texto = this.resultados
      .filter(r => !!r.resultado)
      .map(r => this.formatearTexto(r))
      .join('\n\n');

    if (!texto) return;

    navigator.clipboard.writeText(texto).then(() => {
      this.copiado = true;
      this.alert.success('Resultados copiados al portapapeles.', 'Copiado');
      setTimeout(() => {
        this.copiado = false;
        this.refresh();
      }, 2000);
    });
  }

  exportarCsv(): void {
    const filas: string[] = [
      'CMC,Rango,Estabilidad,Sesgo,Deriva,IncertRef,EstabRef,Repetibilidad,Reproducibilidad,u_c,dof_eff,k,U,U_expandida',
    ];
    for (const r of this.resultados) {
      if (!r.resultado) continue;
      const x = r.resultado;
      filas.push(
        [
          x.cmcNumero,
          `"${x.rangoReferencia}"`,
          x.estabilidad,
          x.sesgo,
          x.deriva,
          x.incertRefEstandar,
          x.estabilidadRefEstandar,
          x.repetibilidad,
          x.reproducibilidad,
          x.incertidumbreCombinada,
          x.dofEfectivos,
          x.coefExpansion,
          x.incertidumbreExpandida,
        ].join(',')
      );
    }
    const blob = new Blob([filas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CMC_${this.titulo || 'resultado'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private formatearTexto(r: CmcCalculado): string {
    if (!r.resultado) return '';
    const x = r.resultado;
    return [
      `# === CMC #${x.cmcNumero} — ${x.rangoReferencia} ===`,
      `Certificados: ${x.certificados.join(', ')}`,
      `Estabilidad:                 ${this.fmt(x.estabilidad)}`,
      `Sesgo (BIAS):                ${this.fmt(x.sesgo)}`,
      `Deriva (Drift):              ${this.fmt(x.deriva)}`,
      `Incert. ref. (u/2):          ${this.fmt(x.incertRefEstandar)}`,
      `Estabilidad ref.:            ${this.fmt(x.estabilidadRefEstandar)}`,
      `Repetibilidad:               ${this.fmt(x.repetibilidad)}`,
      `Reproducibilidad:            ${this.fmt(x.reproducibilidad)}`,
      `u combinada:                 ${this.fmt(x.incertidumbreCombinada)}`,
      `Grados de libertad efectivos:${x.dofEfectivos}`,
      `Coef. expansión (k):         ${this.fmt(x.coefExpansion, 4)}`,
      `U expandida (k·u_c):         ${this.fmt(x.incertidumbreExpandida)}`,
    ].join('\n');
  }

  cerrar(): void {
    this.cerrado.emit();
  }

  private refresh(): void {
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }
}
