// src/app/pages/inicio/inicio.component.ts
import { Component, OnInit, inject } from '@angular/core';

import { AlertService } from '../../../services/core/alert.service';
import { AuthService } from '../../../services/auth/auth.service';

@Component({
  selector: 'app-inicio',
  standalone: true,
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio implements OnInit {
  private alert = inject(AlertService);
  private auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly isLoggedIn = this.auth.isLoggedIn;

  ngOnInit(): void {
    this.checkSession();
  }

  /** Revisa si hay sesión activa y muestra el aviso correspondiente. */
  checkSession(): void {
    if (this.auth.hasValidSession()) {
      const id = this.auth.getUser()?.id_user ?? 'usuario';
      this.alert.success(`Bienvenido`, 'Sesión activa');
      return;
    }

    this.alert.info('No hay sesión activa.', 'Sin sesión');
  }

  /** Cierra la sesión y vuelve a evaluar el estado. */
  logout(): void {
    this.auth.logout();
    this.alert.warning('Se ha cerrado la sesión correctamente', 'Hasta luego');
    this.checkSession();
  }
}
