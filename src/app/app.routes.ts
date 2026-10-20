// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './guard/auth.guard';
import { Newcert } from './components/modules/newcert/newcert';
import { Viewcert } from './components/view/viewcert/viewcert';
import { Pimage } from './components/test/pimage/pimage';
import { Editcert } from './components/modules/editcert/editcert';
import { admincert } from './components/modules/admincert/admincert';
import { Listcert } from './components/view/listcert/listcert';
import { Calcmc } from './components/cmc/calcmc/calcmc';
import { Inicio } from './components/view/inicio/inicio';
import { Cmcparams } from './components/view/cmcparams/cmcparams';
import { Cmcparamsvf } from './components/view/cmcparamsvf/cmcparamsvf';
import { Cmcsr } from './components/core/cmcsr/cmcsr';

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
