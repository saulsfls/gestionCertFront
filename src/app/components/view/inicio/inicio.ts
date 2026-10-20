import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AlertService } from '../../../services/core/alert.service';
import {
  AlertData,
  AlertPosition,
  AlertServiceConfig,
  AlertType,
} from '../../util/alert/alert.model';
import { AuthService } from '../../../services/auth/auth.service';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio {

  private alert = inject(AlertService);
  private auth = inject(AuthService);

  readonly positions: AlertPosition[] = [
    'top-left', 'top-center', 'top-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ];

  readonly types: AlertType[] = [
    'success', 'error', 'warning', 'info', 'question',
  ];

  config: AlertServiceConfig = {
    position: 'top-right',
    duration: 4000,
    maxVisible: 5,
    pauseOnHover: true,
    showProgress: true,
    closeButton: true,
    dismissible: true,
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
  } = {
    type: 'success',
    title: 'Guardado',
    message: 'El producto se guardó correctamente',
    duration: 4000,
    position: 'top-right',
    showProgress: true,
    closeButton: true,
    pauseOnHover: true,
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
  } = {
    type: 'question',
    title: 'Confirmación',
    message: '¿Estás seguro de continuar?',
    confirmText: 'Sí, continuar',
    cancelText: 'Cancelar',
    dismissible: true,
    promptDefault: '',
    promptPlaceholder: 'Escribe aquí…',
  };


  lastResult = '—';


  ngOnInit(): void {
    this.aplicarConfig();
  }

  aplicarConfig(): void {
    this.alert.configure({ ...this.config });
    this.alert.success('Configuración aplicada', 'AlertService');
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

    const message = this.dialogForm.message;
    const title   = this.dialogForm.title;

    const options: Partial<AlertData> = {
      type:        this.dialogForm.type,
      confirmText: this.dialogForm.confirmText,
      cancelText:  this.dialogForm.cancelText,
      dismissible: this.dialogForm.dismissible,
    };

    if (mode === 'prompt') {
      options.prompt = {
        defaultValue: this.dialogForm.promptDefault,
        placeholder:  this.dialogForm.promptPlaceholder,
      };
    }

    if (mode === 'alert') {
      await this.alert.alert(message, title, options);
      this.lastResult = 'alert → void';
      return;
    }

    if (mode === 'confirm') {
      const ok = await this.alert.confirm(message, title, options);
      this.lastResult = `confirm → ${ok}`;
      return;
    }

    const value = await this.alert.prompt(message, title, options);
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

  login(){
    if(this.auth.login()){
      this.alert.success('Se ha inciado sesion correctamente','Bienvenido');
    }
  }

  logout(){
    this.auth.logout();
    this.alert.warning('Se ha cerrado la sesion correctamente','Hasta luego');
  }
}
