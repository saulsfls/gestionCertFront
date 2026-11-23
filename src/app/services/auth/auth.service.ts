// src/app/services/auth/auth.service.ts
import { Injectable, computed, signal } from '@angular/core';

export interface User {
  id_user: string;
  username: string;
  espoToken: string;
}

// 🔑 Claves reales de EspoCRM (sin cambios)
const ESPO_USER_ID_KEY = 'espo-user-lastUserId';
const ESPO_USER_AUTH_KEY = 'espo-user-auth';

// 🔑 Clave para el flag de sesión local
const LOCAL_SESSION_KEY = 'app-local-session';

// 🔑 Contraseña local fija (hardcoded)
const LOCAL_PASSWORD = 'hvtestadmin';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<User | null>(this.readUserFromStorage());
  private readonly _unlocked = signal<boolean>(this.hasSessionFlag());

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly isUnlocked = this._unlocked.asReadonly();

  // ────────────────────────────────────────────────
  // USUARIO (igual que antes)
  // ────────────────────────────────────────────────

  getUser(): User | null {
    return this._user();
  }

  getToken(): string | null {
    const currentUser = this._user();
    return currentUser?.espoToken ? currentUser.espoToken : null;
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
    sessionStorage.removeItem(LOCAL_SESSION_KEY);
    this._user.set(null);
    this._unlocked.set(false);
  }

  addUser(
    username: string = 'testuser',
    id_user: string = 'test_user',
    espoToken: string = 'c252fdda0142bedc99e277bcb6b90a3f'
  ): User {
    const user: User = { id_user, username, espoToken };
    localStorage.setItem(ESPO_USER_ID_KEY, id_user);
    localStorage.setItem(ESPO_USER_AUTH_KEY, btoa(`${username}:${espoToken}`));
    this._user.set(user);
    return user;
  }

  clearUser(): void {
    this.logout();
  }

  // ────────────────────────────────────────────────
  // CONTRASEÑA LOCAL (fija en código)
  // ────────────────────────────────────────────────

  /** ¿La sesión está desbloqueada? */
  isSessionUnlocked(): boolean {
    return this._unlocked();
  }

  /**
   * Valida la contraseña contra el valor fijo del código.
   * Devuelve true si coincide y marca la sesión como desbloqueada.
   */
  loginWithPassword(password: string): boolean {
    if (!password) return false;

    const ok = this.constantTimeEqualStr(password, LOCAL_PASSWORD);
    if (ok) this.markSession(true);
    return ok;
  }

  /** Bloquea la sesión (pide contraseña otra vez sin cerrar sesión Espo). */
  lock(): void {
    sessionStorage.removeItem(LOCAL_SESSION_KEY);
    this._unlocked.set(false);
  }

  // ────────────────────────────────────────────────
  // STORAGE / HELPERS
  // ────────────────────────────────────────────────

  private readUserFromStorage(): User | null {
    try {
      const rawAuth = localStorage.getItem(ESPO_USER_AUTH_KEY);
      const rawId = localStorage.getItem(ESPO_USER_ID_KEY);
      if (!rawAuth && !rawId) return null;

      let username = ' ';
      let token = ' ';
      let id_user = rawId ? rawId.trim() : ' ';

      if (rawAuth) {
        try {
          const partes = atob(rawAuth).split(':');
          if (partes.length === 2) {
            username = partes[0];
            token = partes[1];
          }
        } catch { /* noop */ }
      }

      return {
        id_user: id_user || ' ',
        username: username || ' ',
        espoToken: token || ' ',
      };
    } catch {
      return this._user();
    }
  }

  private hasSessionFlag(): boolean {
    try { return sessionStorage.getItem(LOCAL_SESSION_KEY) === '1'; }
    catch { return false; }
  }

  private markSession(unlocked: boolean): void {
    try {
      if (unlocked) sessionStorage.setItem(LOCAL_SESSION_KEY, '1');
      else sessionStorage.removeItem(LOCAL_SESSION_KEY);
    } catch { /* noop */ }
    this._unlocked.set(unlocked);
  }

  /**
   * Comparación en tiempo constante de dos strings.
   * Evita filtrar información por longitud o por corto-circuito.
   */
  private constantTimeEqualStr(a: string, b: string): boolean {
    const len = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < len; i++) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
  }
}
