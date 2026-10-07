import { Component } from '@angular/core';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-inicio',
  imports: [],
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio {

  constructor(public alert: AlertService) {}
   ngOnInit(): void {
    // Configuración global al arrancar
    this.alert.configure({
      position: 'top-right',
      duration: 4000,
      maxVisible: 4,
      pauseOnHover: true,
      showProgress: true,
    });
  }

  guardar() {
    // Simula tu lógica…
    const ok = true;

    if (ok) {
      this.alert.success('Producto guardado', 'Éxito');
    } else {
      this.alert.error('No se pudo guardar', 'Error');
    }
  }

  async eliminar() {
    // 👇 2. Los modales devuelven Promise — se usan como async/await
    const confirmado = await this.alert.confirm(
      '¿Seguro que deseas eliminar este producto?',
      'Confirmar eliminación'
    );

    if (!confirmado) return;

    // …tu lógica de borrado…
    this.alert.success('Producto eliminado');
  }

  async preguntar() {
    const nombre = await this.alert.prompt(
      '¿Cuál es tu nombre?',
      'Pregunta'
    );

    if (nombre === null) {
      this.alert.info('No se ingresó ningún nombre');
    } else {
      this.alert.success(`Hola, ${nombre}`);
    }

    this.alert.info('Esta es una notificación de información', 'Información');
    this.alert.warning('Esta es una notificación de advertencia', 'Advertencia');
    this.alert.error('Esta es una notificación de error', 'Error');
    this.alert.success('Esta es una notificación de éxito', 'Éxito');
    this.alert.toast({ message: 'Esta es una notificación tipo toast', type: 'info' });
    this.alert.confirm('¿Deseas continuar?', 'Confirmación').then((result) => {
      if (result) {
        this.alert.success('Continuando...');
      } else {
        this.alert.warning('Operación cancelada');
      }
    });
  }


}
