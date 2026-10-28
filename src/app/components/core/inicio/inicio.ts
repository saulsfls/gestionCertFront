// src/app/pages/inicio/inicio.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AlertService } from '../../../services/core/alert.service';
import { AuthService } from '../../../services/auth/auth.service';

@Component({
  selector: 'app-inicio',
  imports: [],
  standalone: true,
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio implements OnInit {
  private alert = inject(AlertService);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly user = this.auth.user;
  readonly isLoggedIn = this.auth.isLoggedIn;

  ngOnInit(): void {
    this.checkSession();
  }

  /** Revisa si hay sesión activa y muestra el aviso o confirmación correspondiente. */
  async checkSession(): Promise<void> {
    if (this.auth.hasValidSession()) {
      const id = this.auth.getUser()?.id_user ?? 'usuario';
      this.alert.success(`Bienvenido`, 'Sesión activa');
      return;
    }

    // 🎨 Usando el modal confirm() de tu AlertService personalizado
    const deseaRegresar = await this.alert.confirm(
      'No tienes una sesión activa en este momento. ¿Deseas regresar al CRM para iniciar sesión?',
      'Sin sesión detectada'
    );

    if (deseaRegresar) {
      this.regresarCRM();
    }
  }

  /** Cierra la sesión y vuelve a evaluar el estado. */
  logout(): void {
    this.auth.logout();
    this.alert.warning('Se ha cerrado la sesión correctamente', 'Hasta luego');
    this.checkSession();
  }

  regresarCRM(): void {
    window.location.href = 'http://192.168.1.200:81/CRM'; // Ajusta la ruta de tu CRM si es distinta
  }
}
