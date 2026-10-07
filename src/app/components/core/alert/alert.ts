import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewEncapsulation,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AlertData, AlertResult, AlertType } from './alert.model';

/* ══════════════════════════════════════════════════════════════════
 *  ICONOS SVG INLINE
 * ══════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════
 *  ICONOS SVG INLINE
 * ══════════════════════════════════════════════════════════════════ */
const ICONS: Record<string, string> = {

  /* ✅ BUENO — paloma grande y gruesa */
  success:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',

  /* ❌ MALO — tacha grande y gruesa */
  error:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',

  /* ⚠️ ADVERTENCIA — triángulo con ! */
  warning:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',

  /* ℹ️ INFO — círculo con ! (antes tenía una "i") */
  info:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 7v7"/><path d="M12 18h.01"/></svg>',

  /* ❓ PREGUNTA — círculo con ? */
  question:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 18h.01"/></svg>',
};

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

const CONFIRM_BTN_MAP: Record<AlertType, string> = {
  success: 'btn-success',
  error: 'btn-danger',
  warning: 'btn-warning',
  info: 'btn-primary',
  question: 'btn-primary',
};

@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './alert.html',
  styleUrl: './alert.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Alert implements AfterViewInit, OnDestroy {

  /* ══════════════════════════════════════════════════════════════
   *  INPUTS / OUTPUTS
   * ══════════════════════════════════════════════════════════════ */
  readonly data = input.required<AlertData>();
  readonly closed = output<AlertResult>();

  /* ══════════════════════════════════════════════════════════════
   *  ESTADO REACTIVO
   * ══════════════════════════════════════════════════════════════ */
  protected readonly hiding = signal<boolean>(false);
  protected readonly visible = signal<boolean>(false);
  protected readonly hovering = signal<boolean>(false);

  protected promptValue = '';

  /* ══════════════════════════════════════════════════════════════
   *  HELPERS DE PLANTILLA (computed)
   * ══════════════════════════════════════════════════════════════ */
  protected readonly closeIcon = CLOSE_ICON;

  protected readonly icon = computed<string>(
    () => ICONS[this.data().type] ?? ICONS['info']
  );

  protected readonly iconType = computed<AlertType>(() =>
    this.data().type === 'question' ? 'info' : this.data().type
  );

  protected readonly isToast = computed<boolean>(
    () => this.data().kind === 'toast'
  );

  protected readonly isPrompt = computed<boolean>(
    () => this.data().dialogMode === 'prompt'
  );

  protected readonly isAlertDialog = computed<boolean>(
    () => this.data().dialogMode === 'alert'
  );

  protected readonly toastClass = computed<string>(() =>
    [
      'nga-toast',
      `nga-toast-${this.data().type}`,
      this.hiding() ? 'nga-hide' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );

  protected readonly modalClass = computed<string>(
    () => `nga-modal nga-modal-${this.iconType()}`
  );

  protected readonly confirmBtnClass = computed<string>(
    () => CONFIRM_BTN_MAP[this.data().type] ?? 'btn-primary'
  );

  protected readonly showProgress = computed<boolean>(
    () =>
      this.isToast() &&
      this.data().showProgress !== false &&
      (this.data().duration ?? 0) > 0
  );

  /* ══════════════════════════════════════════════════════════════
   *  INTERNOS
   * ══════════════════════════════════════════════════════════════ */
  private readonly elRef = inject<ElementRef<HTMLElement>>(ElementRef);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private remaining = 0;
  private startedAt = 0;
  private emitted = false;
  private escHandler?: (e: KeyboardEvent) => void;

  /* ══════════════════════════════════════════════════════════════
   *  CICLO DE VIDA
   * ══════════════════════════════════════════════════════════════ */
  ngAfterViewInit(): void {
    const d = this.data();

    if (d.kind === 'toast') {
      this.remaining = d.duration ?? 0;
      if (this.remaining > 0) this.startTimer();
      return;
    }

    // dialog: entrada animada + foco + ESC
    requestAnimationFrame(() => this.visible.set(true));
    setTimeout(() => this.focusFirst(), 260);

    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.cancel();
    };
    document.addEventListener('keydown', this.escHandler);
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.escHandler) document.removeEventListener('keydown', this.escHandler);
  }

  /* ══════════════════════════════════════════════════════════════
   *  API PÚBLICA (usada por el servicio)
   * ══════════════════════════════════════════════════════════════ */
  close(result: AlertResult = undefined): void {
    if (this.hiding()) return;
    this.hiding.set(true);

    if (this.data().kind === 'toast') {
      const el = this.elRef.nativeElement.querySelector<HTMLElement>('.nga-toast');
      if (el) {
        el.addEventListener('animationend', () => this.emitClose(result), { once: true });
        setTimeout(() => this.emitClose(result), 400); // fallback
      } else {
        this.emitClose(result);
      }
    } else {
      this.visible.set(false);
      setTimeout(() => this.emitClose(result), 260);
    }
  }

  /* ══════════════════════════════════════════════════════════════
   *  HANDLERS DE PLANTILLA
   * ══════════════════════════════════════════════════════════════ */
  protected confirm(): void {
    if (this.isPrompt()) {
      this.close(this.promptValue ?? '');
    } else {
      this.close(true);
    }
  }

  protected cancel(): void {
    if (this.isPrompt()) {
      this.close(null);
    } else if (this.isAlertDialog()) {
      this.close(undefined);
    } else {
      this.close(false);
    }
  }

  protected onBackdrop(e: MouseEvent): void {
    if (this.data().dismissible === false) return;
    if (e.target !== e.currentTarget) return;
    this.cancel();
  }

  protected onHover(entering: boolean): void {
    this.hovering.set(entering);
    if (this.data().pauseOnHover === false) return;
    if ((this.data().duration ?? 0) <= 0) return;
    entering ? this.pauseTimer() : this.startTimer();
  }

  /* ══════════════════════════════════════════════════════════════
   *  HELPERS PRIVADOS
   * ══════════════════════════════════════════════════════════════ */
  private startTimer(): void {
    if (this.remaining <= 0) return;
    this.startedAt = Date.now();
    this.timer = setTimeout(() => this.close(), this.remaining);
  }

  private pauseTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.remaining = Math.max(0, this.remaining - (Date.now() - this.startedAt));
  }

  private focusFirst(): void {
    const el = this.elRef.nativeElement;
    const input = el.querySelector<HTMLInputElement>('.nga-modal-input');
    if (input) {
      input.focus();
      input.select();
      return;
    }
    el.querySelector<HTMLButtonElement>('.nga-btn-confirm')?.focus();
  }

  private emitClose(result: AlertResult): void {
    if (this.emitted) return;
    this.emitted = true;
    this.closed.emit(result);
  }
}
