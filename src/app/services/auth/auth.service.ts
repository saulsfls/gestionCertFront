// src/app/services/auth/auth.service.ts
import { Injectable, computed, signal } from '@angular/core';

export interface User {
  id_user: string;
  username: string;
  espoToken: string;
}

// 🔑 Claves reales que usa EspoCRM en localStorage
const ESPO_USER_ID_KEY = 'espo-user-lastUserId';
const ESPO_USER_AUTH_KEY = 'espo-user-auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<User | null>(this.readUserFromStorage());

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);

  getUser(): User | null {
    return this._user();
  }

  hasValidSession(): boolean {
    const stored = this.readUserFromStorage();
    if (stored) {
      if (stored.id_user !== this._user()?.id_user) {
        this._user.set(stored);
      }
      return true;
    }
    return false;
  }

  login(): boolean {
    const stored = this.readUserFromStorage();
    if (stored) {
      this._user.set(stored);
      return true;
    }
    return false;
  }

  logout(): void {
    localStorage.removeItem(ESPO_USER_ID_KEY);
    localStorage.removeItem(ESPO_USER_AUTH_KEY);
    this._user.set(null);
  }

  getToken(): string | null {
    const currentUser = this._user();
    return currentUser?.espoToken ? currentUser.espoToken : null;
  }

  /** ➕ Genera y guarda los elementos de prueba con el formato real de EspoCRM */
  addUser(
    username: string = 'testuser',
    id_user: string = 'test_user',
    espoToken: string = 'c252fdda0142bedc99e277bcb6b90a3f'
  ): User {
    const user: User = { id_user, username, espoToken };

    // 1. Guardar el ID de usuario en formato hexadecimal de 16 chars
    localStorage.setItem(ESPO_USER_ID_KEY, id_user);

    // 2. Guardar el auth en Base64 con formato "usuario:token"
    const encodedAuth = btoa(`${username}:${espoToken}`);
    localStorage.setItem(ESPO_USER_AUTH_KEY, encodedAuth);

    this._user.set(user);
    return user;
  }

  clearUser(): void {
    this.logout();
  }

  private readUserFromStorage(): User | null {
    try {
      const rawAuth = localStorage.getItem(ESPO_USER_AUTH_KEY);
      const rawId = localStorage.getItem(ESPO_USER_ID_KEY);

      // Si no existe absolutamente nada en localStorage, retornamos null de forma limpia
      if (!rawAuth && !rawId) {
        return null;
      }

      // Valores por defecto de respaldo para evitar falsos negativos en el inicio
      let username = ' ';
      let token = ' ';
      let id_user = rawId ? rawId.trim() : ' ';

      // Intentar decodificar 'espo-user-auth' si está presente
      if (rawAuth) {
        try {
          const decoded = atob(rawAuth);
          const partes = decoded.split(':');
          if (partes.length === 2) {
            username = partes[0];
            token = partes[1];
          }
        } catch {
          // Si falla el base64 pero tenemos el ID, mantenemos los valores por defecto sin borrar nada
        }
      }

      // Devolvemos el usuario activo de forma robusta
      return {
        id_user: id_user || ' ',
        username: username || ' ',
        espoToken: token || ' '
      };
    } catch {
      // En caso de cualquier error crítico de lectura, devolvemos el último usuario conocido en el signal en lugar de null si ya existía
      return this._user();
    }
  }
}
