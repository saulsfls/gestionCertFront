// src/app/services/auth/auth.service.ts
import { Injectable, computed, signal } from '@angular/core';

export interface User {
  id_user: string;
}

// 🔑 Clave que usa EspoCRM para persistir el id del usuario en localStorage
const ESPO_USER_ID_KEY = 'espo-user-lastUserId';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<User | null>(this.readUserFromStorage());

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);



  /** 🔑 Devuelve el usuario actual o null si no hay sesión */
  getUser(): User | null {
    return this._user();
  }

  hasValidSession(): boolean {
    const stored = this.readUserFromStorage();
    if (stored?.id_user !== this._user()?.id_user) {
      this._user.set(stored);
    }
    return stored !== null;
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
    this._user.set(null);
  }

  getToken(): string | null {
    return this._user() ? 'fake-jwt-token' : null;
  }

  addUser(id_user: string = 'test-user'): User {
    const user: User = { id_user };
    localStorage.setItem(ESPO_USER_ID_KEY, id_user);
    this._user.set(user);
    return user;
  }

  /** 🧪 Alias semántico de `logout()` para tests. */
  clearUser(): void {
    this.logout();
  }

  private readUserFromStorage(): User | null {
    try {
      const rawId = localStorage.getItem(ESPO_USER_ID_KEY);
      if (!rawId) return null;

      // EspoCRM guarda el id como string plano; por robustez soportamos
      // también JSON { id_user } por si el formato cambiara.
      let id = rawId;
      try {
        const parsed = JSON.parse(rawId);
        if (parsed && typeof parsed === 'object') {
          id = parsed.id_user ?? parsed.id ?? rawId;
        }
      } catch {
        /* id plano */
      }

      return id ? { id_user: id } : null;
    } catch {
      return null;
    }
  }
}
