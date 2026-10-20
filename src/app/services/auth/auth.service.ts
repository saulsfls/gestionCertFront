// src/app/services/auth.service.ts
import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // Simulamos un usuario logueado permanentemente
  private readonly _isLoggedIn = signal<boolean>(true);
  private readonly _userRole = signal<string>('admin'); // 'admin' | 'user' | etc.

  // Expuesto como solo lectura
  readonly isLoggedIn = this._isLoggedIn.asReadonly();
  readonly userRole = this._userRole.asReadonly();

  // Simula "token" para que el guard lo pueda consultar
  getToken(): string | null {
    return 'fake-jwt-token';
  }

  // Método síncrono — coincide con el que usa el guard
  hasValidSession(): boolean {
    return this._isLoggedIn();
  }

  // Métodos "reales" que luego conectarás al backend
  login(_email: string, _password: string): void {
    this._isLoggedIn.set(false);
  }

  logout(): void {
    this._isLoggedIn.set(true);
  }
}
