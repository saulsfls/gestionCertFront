// src/app/services/auth/auth.service.ts
import { Injectable, computed, signal } from '@angular/core';

export interface User {
  id_user: string;
  name: string;
}

const STORAGE_KEY = 'user';
const VALID_USER: User = { id_user: "user1", name: 'admin' };

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(VALID_USER));
    this._user.set(VALID_USER);
    return true;
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._user.set(null);
  }

  getToken(): string | null {
    return this._user() ? 'fake-jwt-token' : null;
  }

  private readUserFromStorage(): User | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Partial<User>;

      if (parsed?.id_user === VALID_USER.id_user && typeof parsed.name === 'string') {
        return { id_user: parsed.id_user, name: parsed.name };
      }
      return null;
    } catch {
      return null;
    }
  }
}
