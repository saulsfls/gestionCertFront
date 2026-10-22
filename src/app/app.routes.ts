// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './guard/auth.guard';
import { Newcert } from './components/cert/newcert/newcert';
import { Viewcert } from './components/cert/viewcert/viewcert';
import { Pimage } from './components/test/pimage/pimage';
import { Editcert } from './components/cert/editcert/editcert';
import { admincert } from './components/cert/admincert/admincert';
import { Listcert } from './components/cert/listcert/listcert';
import { Calcmc } from './components/cmc/calcmc/calcmc';
import { Inicio } from './components/core/inicio/inicio';
import { Cmcparams } from './components/cmc/cmcparams/cmcparams';
import { Cmcparamsvf } from './components/cmc/cmcparamsvf/cmcparamsvf';
import { Cmcsr } from './components/calc/cmcsr/cmcsr';

export const routes: Routes = [
  //Rutas publicas
  { path: 'inicio', component: Inicio },

  //Rutas privadas protegidas
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
      { path: 'newcert', component: Newcert },
      { path: 'pimage', component: Pimage },
      { path: 'editcert/:id', component: Editcert },
      { path: 'admincert', component: admincert },
      { path: 'listcert', component: Listcert },
      { path: 'viewcert/:id', component: Viewcert },
      { path: 'calcmc', component: Calcmc },
      { path: 'cmcparams', component: Cmcparams },
      { path: 'cmcparamsvf', component: Cmcparamsvf },
      { path: 'cmc-resultados', component: Cmcsr },
    ]
  },
  // Fallback
  { path: '**', redirectTo: 'inicio' }
];
