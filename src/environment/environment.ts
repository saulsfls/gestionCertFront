import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID, isDevMode } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Global {
  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  get URLCalibraciones(): string {
    // Si se ejecuta en el servidor (SSR)
    if (!isPlatformBrowser(this.platformId)) {
      return 'http://26.187.160.72:81/calibraciones/api/';
    }

    // Si estás en desarrollo local (ng serve), usa la ruta del proxy para evitar CORS
    if (isDevMode()) {
      return '/api/';
    }

    // Comportamiento normal en producción
    return window.location.host.includes('192.168.1')
      ? 'http://192.168.1.201:81/calibraciones/api/'
      : 'http://26.187.160.72:81/calibraciones/api/';
  }
}
//Se crean las rutas exportables de cada uno de los sistemas ivolucrados en en el funcionamiento
//Estas url se inyetan en los servicios correspondientes
export const environment = {
  production: false,
  apiCertificados: 'http://192.168.1.187:3000/api', //Api de los Certificados
  apiCmc: 'http://192.168.1.187:3000/api/cmc-data', //Api del CMC
  apiImagen: 'http://192.168.1.206:3000/api/tablas', //Procesamiento de la imagen, aputa a un servidor con mejores carateristicas para extraer datos con IA
  apiPatron: 'http://192.168.1.200' //Apunta al servidor CRM de la empresa, Aun falta corroborar puerto
};

