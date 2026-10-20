// src/app/guards/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';

/**
 * Guard de autenticación.
 * - Si hay sesión válida → permite la navegación.
 * - Si no → redirige a /login guardando returnUrl.
 */
const checkAuth = (url: string): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.hasValidSession()) {
    return true;
  }

  return router.createUrlTree(['/inicio'], {
    queryParams: { returnUrl: url }
  });
};

/** Para rutas sin lazy loading */
export const authGuard: CanActivateFn = (_route, state) => {
  return checkAuth(state.url);
};

/** Para rutas con lazy loading (no descarga el chunk si falla) */
export const authMatchGuard: CanMatchFn = (_route, segments) => {
  const url = '/' + segments.map(s => s.path).join('/');
  return checkAuth(url);
};
