// src/app/pages/alertconf/alertconf.ts
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AlertService } from '../../../services/core/alert.service';
import {
  AlertData,
  AlertPosition,
  AlertServiceConfig,
  AlertSize,
  AlertSizeOptions,
  AlertType,
} from '../../core/alert/alert.model';
import { AuthService } from '../../../services/auth/auth.service';

const TEST_PASSWORD = 'FLATHforce';

@Component({
  imports: [FormsModule],
  selector: 'app-alertconf',
  styleUrl: './alertconf.css',
  templateUrl: './alertconf.html',
})
export class Alertconf implements OnInit {
  private alert = inject(AlertService);
  private auth = inject(AuthService);

  mostrarBotonCrearUsuario = false;
  private passwordVerificada = false;

  readonly positions: AlertPosition[] = [
    'top-left', 'top-center', 'top-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ];

  readonly types: AlertType[] = [
    'success', 'error', 'warning', 'info', 'question',
  ];

  readonly sizes: AlertSize[] = ['sm', 'md', 'lg', 'xl', 'full'];

  config: AlertServiceConfig = {
    position: 'top-right',
    duration: 4000,
    maxVisible: 5,
    pauseOnHover: true,
    showProgress: true,
    closeButton: true,
    dismissible: true,
    size: 'md',
    scrollable: false,
    sizeOptions: { maxWidth: '90vw' },
  };

  toastForm: {
    type: AlertType;
    title: string;
    message: string;
    duration: number;
    position: AlertPosition;
    showProgress: boolean;
    closeButton: boolean;
    pauseOnHover: boolean;
    size: AlertSize;
    width: string;
    maxWidth: string;
    maxHeight: string;
    scrollable: boolean;
    messageMaxHeight: string;
    fontSize: string;
    titleFontSize: string;
    lineHeight: number | null;
  } = {
    type: 'success',
    title: 'Guardado',
    message: 'El producto se guardó correctamente',
    duration: 4000,
    position: 'top-right',
    showProgress: true,
    closeButton: true,
    pauseOnHover: true,
    size: 'md',
    width: '',
    maxWidth: '',
    maxHeight: '',
    scrollable: false,
    messageMaxHeight: '',
    fontSize: '',
    titleFontSize: '',
    lineHeight: null,
  };

  dialogForm: {
    type: AlertType;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    dismissible: boolean;
    promptDefault: string;
    promptPlaceholder: string;
    size: AlertSize;
    width: string;
    maxWidth: string;
    maxHeight: string;
    scrollable: boolean;
  } = {
    type: 'question',
    title: 'Confirmación',
    message: '¿Estás seguro de continuar?',
    confirmText: 'Sí, continuar',
    cancelText: 'Cancelar',
    dismissible: true,
    promptDefault: '',
    promptPlaceholder: 'Escribe aquí…',
    size: 'md',
    width: '',
    maxWidth: '',
    maxHeight: '',
    scrollable: false,
  };

  lastResult = '—';

  ngOnInit(): void {
    this.aplicarConfig();
    this.checkSession();
  }

  aplicarConfig(): void {
    this.alert.configure({ ...this.config });
    this.alert.success('Configuración aplicada', 'AlertService');
  }

  checkSession(): void {
    const haySesionValida = this.auth.hasValidSession();
    this.mostrarBotonCrearUsuario = !haySesionValida;

    if (haySesionValida) {
      const id = this.auth.getUser()?.id_user ?? 'usuario';
      this.alert.success(`Bienvenido, ${id}`, 'Sesión activa');
      return;
    }

    this.alert.info(
      'No hay sesión activa. Presiona "Crear usuario de prueba" para comenzar.',
      'Sin sesión'
    );
  }

  async verificarPassword(): Promise<void> {
    if (this.auth.hasValidSession()) {
      this.alert.info('Ya existe una sesión activa.', 'Sin cambios');
      return;
    }

    let pass: string | null = null;
    try {
      pass = await this.alert.prompt(
        'Ingrese la contraseña para crear el usuario de prueba.',
        'Acceso restringido',
        {
          type: 'question',
          confirmText: 'Acceder',
          cancelText: 'Cancelar',
          dismissible: false,
          prompt: {
            placeholder: 'Contraseña…',
            defaultValue: '',
            inputType: 'password',
          },
        }
      );
    } catch {
      this.alert.error('No se pudo abrir el diálogo de contraseña.', 'Error');
      return;
    }

    if (pass === null || pass === undefined) {
      this.alert.info('No se ha creado ningún usuario.', 'Cancelado');
      return;
    }
    if (pass === '') {
      this.alert.warning('La contraseña no puede estar vacía.', 'Campo vacío');
      return;
    }
    if (pass !== TEST_PASSWORD) {
      this.alert.warning(
        'Contraseña incorrecta. No se ha creado el usuario.',
        'Acceso denegado'
      );
      return;
    }

    this.passwordVerificada = true;
    try {
      this.createTestUser();
    } finally {
      this.passwordVerificada = false;
    }
  }

  createTestUser(): void {
    if (!this.passwordVerificada) {
      this.alert.error('Acceso no autorizado.', 'Contraseña requerida');
      return;
    }
    if (this.auth.hasValidSession()) {
      this.alert.info('Ya existe una sesión activa.', 'Sin cambios');
      return;
    }
    const u = this.auth.addUser();
    this.mostrarBotonCrearUsuario = false;
    this.alert.success(`Usuario de prueba creado: ${u.id_user}`, 'Testing listo');
  }

  toastSuccess(): void {
    this.alert.success('Operación completada correctamente', 'Éxito');
  }
  toastError(): void {
    this.alert.error('No se pudo conectar con el servidor', 'Error');
  }
  toastWarning(): void {
    this.alert.warning('Revisa los datos antes de continuar', 'Atención');
  }
  toastInfo(): void {
    this.alert.info('Hay una nueva versión disponible', 'Información');
  }

  lanzarToast(): void {
    this.alert.toast({
      type:         this.toastForm.type,
      title:        this.toastForm.title,
      message:      this.toastForm.message,
      duration:     this.toastForm.duration,
      position:     this.toastForm.position,
      showProgress: this.toastForm.showProgress,
      closeButton:  this.toastForm.closeButton,
      pauseOnHover: this.toastForm.pauseOnHover,
      size:         this.toastForm.size,
      sizeOptions:  this.buildToastSizeOptions(),
    });
  }

  lanzarVarios(): void {
    this.alert.success('Producto #1 guardado');
    setTimeout(() => this.alert.info('Sincronizando…'), 200);
    setTimeout(() => this.alert.warning('Producto #2 tiene stock bajo'), 400);
    setTimeout(() => this.alert.error('Producto #3 no se pudo guardar'), 600);
    setTimeout(() => this.alert.success('Sincronización completa'), 800);
  }

  async mostrarAlert(): Promise<void> {
    await this.alert.alert(
      'Esta es una notificación tipo modal de solo lectura.',
      'Aviso del sistema'
    );
    this.lastResult = 'alert → void';
  }

  async mostrarConfirm(): Promise<void> {
    const ok = await this.alert.confirm(
      '¿Deseas eliminar el registro permanentemente?',
      'Confirmar acción'
    );
    this.lastResult = `confirm → ${ok}`;
    if (ok) this.alert.success('Registro eliminado');
    else this.alert.warning('Operación cancelada');
  }

  async mostrarPrompt(): Promise<void> {
    const nombre = await this.alert.prompt(
      '¿Cuál es tu nombre?',
      'Bienvenido',
      { prompt: { placeholder: 'Tu nombre…' } }
    );

    this.lastResult = `prompt → ${nombre === null ? 'null' : `"${nombre}"`}`;

    if (nombre === null) this.alert.info('No se ingresó ningún nombre');
    else if (!nombre.trim()) this.alert.warning('El nombre está vacío');
    else this.alert.success(`Hola, ${nombre}!`);
  }

  async lanzarDialogoCustom(mode: 'alert' | 'confirm' | 'prompt'): Promise<void> {
    const options: Partial<AlertData> = {
      type:        this.dialogForm.type,
      confirmText: this.dialogForm.confirmText,
      cancelText:  this.dialogForm.cancelText,
      dismissible: this.dialogForm.dismissible,
      size:        this.dialogForm.size,
      sizeOptions: this.buildDialogSizeOptions(),
    };

    if (mode === 'prompt') {
      options.prompt = {
        defaultValue: this.dialogForm.promptDefault,
        placeholder:  this.dialogForm.promptPlaceholder,
      };
    }

    if (mode === 'alert') {
      await this.alert.alert(this.dialogForm.message, this.dialogForm.title, options);
      this.lastResult = 'alert → void';
      return;
    }

    if (mode === 'confirm') {
      const ok = await this.alert.confirm(this.dialogForm.message, this.dialogForm.title, options);
      this.lastResult = `confirm → ${ok}`;
      return;
    }

    const value = await this.alert.prompt(this.dialogForm.message, this.dialogForm.title, options);
    this.lastResult = `prompt → ${value === null ? 'null' : `"${value}"`}`;
  }

  limpiar(): void {
    this.alert.clear();
    this.lastResult = '—';
  }

  async demoCompleto(): Promise<void> {
    this.alert.success('1. Producto creado', 'Paso 1/4');
    await this.delay(600);

    this.alert.info('2. Validando información…', 'Paso 2/4');
    await this.delay(600);

    this.alert.warning('3. Se requiere confirmación', 'Paso 3/4');
    const ok = await this.alert.confirm(
      '¿Deseas continuar con el proceso?',
      'Confirmar'
    );

    if (!ok) {
      this.alert.error('Proceso cancelado por el usuario', 'Cancelado');
      return;
    }

    this.alert.success('4. Proceso completado con éxito', 'Paso 4/4');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  login(): void {
    if (this.auth.login()) {
      this.alert.success('Se ha iniciado sesión correctamente', 'Bienvenido');
      this.checkSession();
    }
  }

  logout(): void {
    this.auth.logout();
    this.alert.warning('Se ha cerrado la sesión correctamente', 'Hasta luego');
    this.checkSession();
  }

  /* ── 🎨 Demos nuevos: presets, texto largo y control fino ── */

  demoPresets(): void {
    this.alert.toast({ message: 'Toast pequeño (sm).', size: 'sm' });
    this.alert.toast({ message: 'Toast mediano (md, default).', size: 'md' });
    this.alert.toast({
      message: 'Toast grande (lg) con un poco más de texto para notar la diferencia.',
      size: 'lg',
    });
    this.alert.toast({
      message: 'Toast extra grande (xl) con bastante más contenido para apreciar el ancho.',
      size: 'xl',
    });
    this.alert.toast({
      message: 'Toast full-width: ocupa todo el ancho del root.',
      size: 'full',
      position: 'top-center',
    });
    this.alert.toast({
      message: 'Preset + override: parte de lg pero limita el ancho en pantallas pequeñas.',
      size: 'lg',
      sizeOptions: { maxWidth: '85vw' },
    });
  }

  demoTextoLargo(): void {
    const detalle = Array.from({ length: 30 }, (_, i) =>
      `Línea ${i + 1}: detalle extenso del error ocurrido durante el procesamiento del archivo.`
    ).join('\n');

    this.alert.toast({
      type: 'error',
      title: 'Error al procesar el archivo',
      message: detalle,
      size: 'sm',
      sizeOptions: {
        width: '250 px',
        maxWidth: '95vw',
        maxHeight: '70vh',
        scrollable: true,
        messageMaxHeight: '260px',
        fontSize: '14px',
        lineHeight: 1.5,
      },
      duration: 0,
      closeButton: true,
      pauseOnHover: true,
    });
  }

  demoControlFino(): void {
    this.alert.toast({
      type: 'info',
      title: 'Configuración personalizada',
      message: 'Este toast tiene medidas y tipografía definidas una por una.',
      sizeOptions: {
        width: '520px',
        minWidth: '320px',
        maxWidth: '90vw',
        fontSize: '15px',
        titleFontSize: '17px',
        lineHeight: 1.6,
      },
      position: 'bottom-right',
      duration: 8000,
      showProgress: true,
      pauseOnHover: true,
      closeButton: true,
    });

    this.alert.toast({
      type: 'warning',
      message: 'Toast sin botón de cerrar y sin barra de progreso.',
      size: 'lg',
      closeButton: false,
      showProgress: false,
      duration: 3000,
    });
  }

  demoConfigGlobal(): void {
    this.alert.configure({
      position: 'bottom-center',
      duration: 4000,
      maxVisible: 3,
      pauseOnHover: true,
      showProgress: true,
      closeButton: true,
      dismissible: true,
      size: 'lg',
      scrollable: true,
      sizeOptions: { maxWidth: '90vw' },
    });

    this.alert.info('Defaults globales aplicados: bottom-center, lg, scrollable.');
    this.alert.success('Este toast hereda la nueva configuración.');
  }

  /* ── 🛠️ Helpers de construcción de opciones ───────────────── */

  private buildToastSizeOptions(): AlertSizeOptions | undefined {
    const f = this.toastForm;
    const opts: AlertSizeOptions = {};

    if (f.width)            opts.width = f.width;
    if (f.maxWidth)         opts.maxWidth = f.maxWidth;
    if (f.maxHeight)        opts.maxHeight = f.maxHeight;
    if (f.fontSize)         opts.fontSize = f.fontSize;
    if (f.titleFontSize)    opts.titleFontSize = f.titleFontSize;
    if (f.lineHeight != null) opts.lineHeight = f.lineHeight;
    if (f.scrollable) {
      opts.scrollable = true;
      if (f.messageMaxHeight) opts.messageMaxHeight = f.messageMaxHeight;
    }

    return Object.keys(opts).length ? opts : undefined;
  }

  private buildDialogSizeOptions(): AlertSizeOptions | undefined {
    const f = this.dialogForm;
    const opts: AlertSizeOptions = {};

    if (f.width)     opts.width = f.width;
    if (f.maxWidth)  opts.maxWidth = f.maxWidth;
    if (f.maxHeight) opts.maxHeight = f.maxHeight;
    if (f.scrollable) opts.scrollable = true;

    return Object.keys(opts).length ? opts : undefined;
  }
}