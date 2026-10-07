import {
  ApplicationRef,
  ComponentRef,
  EnvironmentInjector,
  Injectable,
  OnDestroy,
  PLATFORM_ID,
  createComponent,
  inject,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

import { Alert } from '../components/core/alert/alert';
import {
  AlertData,
  AlertPosition,
  AlertResult,
  AlertServiceConfig,
  DialogMode,
} from '../components/core/alert/alert.model';

interface ToastEntry {
  ref: ComponentRef<Alert>;
  host: HTMLElement;
}

@Injectable({ providedIn: 'root' })
export class AlertService implements OnDestroy {
  private readonly appRef      = inject(ApplicationRef);
  private readonly envInjector = inject(EnvironmentInjector);
  private readonly doc         = inject(DOCUMENT);
  private readonly platformId  = inject(PLATFORM_ID);
  private readonly isBrowser   = isPlatformBrowser(this.platformId);

  private readonly roots   = new Map<AlertPosition, HTMLElement>();
  private readonly toasts  = new Map<string, ToastEntry>();
  private readonly dialogs = new Set<ComponentRef<Alert>>();
  private sequence = 0;

  private config: AlertServiceConfig = {
    position:     'top-right',
    duration:     4000,
    maxVisible:   5,
    pauseOnHover: true,
    showProgress: true,
    closeButton:  true,
    dismissible:  true,
  };

  ngOnDestroy(): void {
    this.clear();
    this.roots.forEach(r => r.remove());
    this.roots.clear();
  }

  /* ══════════════════════════════════════════════════════════════
   *  CONFIGURACIÓN GLOBAL
   * ══════════════════════════════════════════════════════════════ */
  configure(patch: Partial<AlertServiceConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /* ══════════════════════════════════════════════════════════════
   *  SHORTHANDS DE TOAST
   * ══════════════════════════════════════════════════════════════ */
  success(message: string, title?: string, options: Partial<AlertData> = {}): void {
    this.toast({ ...options, type: 'success', message, title });
  }
  error(message: string, title?: string, options: Partial<AlertData> = {}): void {
    this.toast({ ...options, type: 'error', message, title });
  }
  warning(message: string, title?: string, options: Partial<AlertData> = {}): void {
    this.toast({ ...options, type: 'warning', message, title });
  }
  info(message: string, title?: string, options: Partial<AlertData> = {}): void {
    this.toast({ ...options, type: 'info', message, title });
  }

  /* ══════════════════════════════════════════════════════════════
   *  TOAST
   * ══════════════════════════════════════════════════════════════ */
  toast(options: Partial<AlertData> & { message: string }): void {
    if (!this.isBrowser) return;

    const position = options.position ?? this.config.position;
    const root     = this.getRoot(position);

    /* respetar límite de visibles */
    const live = Array.from(root.children).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement && !el.classList.contains('nga-hide')
    );
    if (live.length >= this.config.maxVisible) {
      const oldestId = live[0].dataset['alertId'];
      if (oldestId) this.toasts.get(oldestId)?.ref.instance.close();
    }

    const id   = `nga-${++this.sequence}`;
    const host = this.doc.createElement('div');
    host.dataset['alertId'] = id;
    host.style.display = 'contents'; // el toast queda como hijo directo del root
    root.appendChild(host);

    const ref = createComponent(Alert, {
      environmentInjector: this.envInjector,
      hostElement: host,
    });

    this.appRef.attachView(ref.hostView);

    ref.setInput('data', {
      id,
      kind:         'toast',
      type:         options.type         ?? 'info',
      message:      options.message,
      title:        options.title,
      position,
      duration:     options.duration     ?? this.config.duration,
      showProgress: options.showProgress ?? this.config.showProgress,
      closeButton:  options.closeButton  ?? this.config.closeButton,
      pauseOnHover: options.pauseOnHover ?? this.config.pauseOnHover,
    } satisfies AlertData);

    ref.changeDetectorRef.detectChanges();

    const sub = ref.instance.closed.subscribe(() => {
      sub.unsubscribe();
      this.destroyRef(ref, host);
      this.toasts.delete(id);
    });

    this.toasts.set(id, { ref, host });
  }

  /* ══════════════════════════════════════════════════════════════
   *  DIALOG API
   * ══════════════════════════════════════════════════════════════ */
  alert(message: string, title?: string, options: Partial<AlertData> = {}): Promise<void> {
    return this.dialog({
      ...options,
      type: options.type ?? 'info',
      title,
      message,
      dialogMode: 'alert',
    }).then(() => void 0);
  }

  confirm(message: string, title?: string, options: Partial<AlertData> = {}): Promise<boolean> {
    return this.dialog({
      ...options,
      type: options.type ?? 'question',
      title,
      message,
      dialogMode: 'confirm',
    }).then(r => r === true);
  }

  prompt(message: string, title?: string, options: Partial<AlertData> = {}): Promise<string | null> {
    return this.dialog({
      ...options,
      type: options.type ?? 'question',
      title,
      message,
      dialogMode: 'prompt',
    }).then(r => (r == null ? null : String(r)));
  }

  /* ══════════════════════════════════════════════════════════════
   *  UTILIDADES
   * ══════════════════════════════════════════════════════════════ */
  clear(): void {
    Array.from(this.toasts.keys()).forEach(id =>
      this.toasts.get(id)?.ref.instance.close()
    );
    Array.from(this.dialogs).forEach(ref => ref.instance.close());
  }

  /* ══════════════════════════════════════════════════════════════
   *  INTERNOS
   * ══════════════════════════════════════════════════════════════ */
  private dialog(
    data: Partial<AlertData> & { message: string; dialogMode: DialogMode }
  ): Promise<AlertResult> {
    return new Promise(resolve => {
      if (!this.isBrowser) { resolve(null); return; }

      const id   = `nga-${++this.sequence}`;
      const host = this.doc.createElement('div');
      host.dataset['alertId'] = id;
      host.style.display = 'contents';
      this.doc.body.appendChild(host);

      const ref = createComponent(Alert, {
        environmentInjector: this.envInjector,
        hostElement: host,
      });

      this.appRef.attachView(ref.hostView);

      ref.setInput('data', {
        id,
        kind:        'dialog',
        type:        data.type ?? 'info',
        message:     data.message,
        title:       data.title,
        dialogMode:  data.dialogMode,
        dismissible: data.dismissible ?? this.config.dismissible,
        confirmText: data.confirmText,
        cancelText:  data.cancelText,
        prompt:      data.prompt,
      } satisfies AlertData);

      ref.changeDetectorRef.detectChanges();

      this.dialogs.add(ref);

      const sub = ref.instance.closed.subscribe(result => {
        sub.unsubscribe();
        this.destroyRef(ref, host);
        this.dialogs.delete(ref);
        resolve(result);
      });
    });
  }

  private destroyRef(ref: ComponentRef<Alert>, host: HTMLElement): void {
    try { this.appRef.detachView(ref.hostView); } catch { /* noop */ }
    ref.destroy();
    host.remove();
  }

  private getRoot(position: AlertPosition): HTMLElement {
    const existing = this.roots.get(position);
    if (existing) return existing;

    const root = this.doc.createElement('div');
    root.className = `nga-root nga-pos-${position}`;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'false');
    this.doc.body.appendChild(root);
    this.roots.set(position, root);
    return root;
  }
}
