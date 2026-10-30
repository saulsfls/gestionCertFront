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

import {
  ALERT_SIZE_PRESETS,
  AlertData,
  AlertResult,
  AlertSize,
  AlertSizeOptions,
  AlertType,
} from './alert.model';

const ICONS: Record<string, string> = {
  success:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  warning:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',
  info:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 7v7"/><path d="M12 18h.01"/></svg>',
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
  readonly data = input.required<AlertData>();
  readonly closed = output<AlertResult>();

  protected readonly hiding = signal<boolean>(false);
  protected readonly visible = signal<boolean>(false);
  protected readonly hovering = signal<boolean>(false);

  protected promptValue = '';

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

  protected readonly size = computed<AlertSize>(
    () => this.data().size ?? 'md'
  );

  protected readonly resolvedSize = computed<AlertSizeOptions>(() => {
    const preset = ALERT_SIZE_PRESETS[this.size()] ?? ALERT_SIZE_PRESETS.md;
    return { ...preset, ...(this.data().sizeOptions ?? {}) };
  });

  protected readonly toastClass = computed<string>(() =>
    [
      'nga-toast',
      `nga-toast-${this.data().type}`,
      `nga-toast-size-${this.size()}`,
      this.resolvedSize().scrollable ? 'nga-toast-scrollable' : '',
      this.hiding() ? 'nga-hide' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );

  protected readonly toastStyles = computed<Record<string, string>>(() => {
    const s = this.resolvedSize();
    const styles: Record<string, string> = {};

    if (s.width) styles['width'] = s.width;
    if (s.minWidth) styles['min-width'] = s.minWidth;
    if (s.maxWidth) styles['max-width'] = s.maxWidth;
    if (s.maxHeight) styles['max-height'] = s.maxHeight;
    if (s.fontSize) styles['--nga-toast-font-size'] = s.fontSize;
    if (s.titleFontSize) styles['--nga-toast-title-font-size'] = s.titleFontSize;
    if (s.lineHeight != null) styles['--nga-toast-line-height'] = String(s.lineHeight);
    if (s.messageMaxHeight) styles['--nga-toast-message-max-height'] = s.messageMaxHeight;

    return styles;
  });

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

  private readonly elRef = inject<ElementRef<HTMLElement>>(ElementRef);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private remaining = 0;
  private startedAt = 0;
  private emitted = false;
  private escHandler?: (e: KeyboardEvent) => void;

  ngAfterViewInit(): void {
    const d = this.data();

    if (d.kind === 'toast') {
      this.remaining = d.duration ?? 0;
      if (this.remaining > 0) this.startTimer();
      return;
    }

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

  close(result: AlertResult = undefined): void {
    if (this.hiding()) return;
    this.hiding.set(true);

    if (this.data().kind === 'toast') {
      const el = this.elRef.nativeElement.querySelector<HTMLElement>('.nga-toast');
      if (el) {
        el.addEventListener('animationend', () => this.emitClose(result), { once: true });
        setTimeout(() => this.emitClose(result), 400);
      } else {
        this.emitClose(result);
      }
    } else {
      this.visible.set(false);
      setTimeout(() => this.emitClose(result), 260);
    }
  }

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