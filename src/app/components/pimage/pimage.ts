import { Component, ChangeDetectorRef, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ImageCropperComponent, ImageCroppedEvent, LoadedImage } from 'ngx-image-cropper';
import { CertService } from '../../services/cert.service';

@Component({
  selector: 'app-pimage',
  standalone: true,
  imports: [CommonModule, ImageCropperComponent],
  templateUrl: './pimage.html',
  styleUrl: './pimage.css',
})
export class Pimage {
  // Verificación del entorno de ejecución
  private platformId = inject(PLATFORM_ID);
  isBrowser: boolean = isPlatformBrowser(this.platformId);

  imageChangedEvent: Event | null = null;
  pasteImageFile: File | undefined = undefined;
  croppedImageBase64: string = '';
  cargando: boolean = false;
  tablaProcesada: any = null;

  mensajeError: string = '';
  mensajeExito: string = '';

  constructor(
    private certService: CertService,
    private cdr: ChangeDetectorRef
  ) {}

  onPaste(event: ClipboardEvent): void {
    if (!this.isBrowser) return;

    this.limpiarMensajes();
    const items = event.clipboardData?.items;
    if (!items) return;

    let imagenEncontrada = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          this.imageChangedEvent = null;
          this.croppedImageBase64 = '';
          this.pasteImageFile = new File([file], `pasted_image_${Date.now()}.png`, { type: file.type });
          this.cdr.detectChanges();
          imagenEncontrada = true;
        }
        break;
      }
    }

    if (!imagenEncontrada) {
      this.mensajeError = 'El contenido pegado no es una imagen válida.';
    }
  }

  fileChangeEvent(event: Event): void {
    this.limpiarMensajes();
    this.pasteImageFile = undefined;
    this.croppedImageBase64 = '';
    this.imageChangedEvent = event;
  }

  imageCropped(event: ImageCroppedEvent): void {
    if (event.base64) {
      this.croppedImageBase64 = event.base64;
    } else if (event.objectUrl && this.isBrowser) {
      this.blobToBase64(event.objectUrl).then(base64 => {
        this.croppedImageBase64 = base64;
      });
    }
  }

  imageLoaded(image?: LoadedImage): void {
    this.cdr.detectChanges();
  }

  cropperReady(): void {
    // El cropper está listo para interacción
  }

  loadImageFailed(): void {
    this.mensajeError = 'Error al cargar la imagen. Intenta con otra captura o archivo.';
  }

  private blobToBase64(blobUrl: string): Promise<string> {
    if (!this.isBrowser) return Promise.resolve('');

    return fetch(blobUrl)
      .then(r => r.blob())
      .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }));
  }

  enviarANode(): void {
    this.limpiarMensajes();

    if (!this.pasteImageFile && !this.imageChangedEvent) {
      this.mensajeError = 'Por favor selecciona o pega una imagen primero.';
      return;
    }

    if (!this.croppedImageBase64) {
      this.mensajeError = 'Ajusta el área de selección sobre la tabla antes de extraer.';
      return;
    }

    this.cargando = true;
    this.tablaProcesada = null;

    this.certService.procesarTabla(this.croppedImageBase64).subscribe({
      next: (res) => {
        this.tablaProcesada = res?.data || res;
        this.mensajeExito = 'Tabla procesada exitosamente.';
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error en servidor:', err);
        this.mensajeError = 'Ocurrió un error al procesar la tabla en el servidor.';
        this.cargando = false;
      }
    });
  }

  private limpiarMensajes(): void {
    this.mensajeError = '';
    this.mensajeExito = '';
  }
}
