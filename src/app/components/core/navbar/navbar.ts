// src/app/components/layout/navbar/navbar.ts
import { Component, HostListener, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../services/auth/auth.service';

type DropdownName = 'herramientas' | 'certificados' | 'cmc';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  isCollapsed = true;

  private authService = inject(AuthService);
  isLoggedIn = this.authService.isLoggedIn;

  // Estado de cada dropdown
  dropdowns: Record<DropdownName, boolean> = {
    herramientas: false,
    certificados: false,
    cmc: false,
  };

  /** Cierra todos los dropdowns al hacer clic fuera */
  @HostListener('document:click')
  closeAllDropdowns(): void {
    this.dropdowns = { herramientas: false, certificados: false, cmc: false };
  }

  /** Abre/cierra un dropdown (y cierra los demás) */
  toggleDropdown(event: Event, name: DropdownName): void {
    event.stopPropagation(); // evita que el HostListener lo cierre al instante
    const wasOpen = this.dropdowns[name];
    this.dropdowns = { herramientas: false, certificados: false, cmc: false };
    this.dropdowns[name] = !wasOpen;
  }
}
