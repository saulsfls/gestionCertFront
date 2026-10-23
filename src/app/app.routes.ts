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
import { Viewcmc } from './components/cmc/viewcmc/viewcmc';
import { Listcmc } from './components/cmc/listcmc/listcmc';
import { Editcmc } from './components/cmc/editcmc/editcmc';

export const routes: Routes = [
  //Rutas publicas
  { path: 'inicio', component: Inicio },

  //Rutas privadas protegidas
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
      //Ruta del procesamiento de imagen (Solo prueba)
      { path: 'pimage', component: Pimage },
      //Rutas del Certificado
      { path: 'new-cert', component: Newcert },
      { path: 'edit-cert/:id', component: Editcert },
      { path: 'admin-cert', component: admincert },
      { path: 'list-cert', component: Listcert },
      { path: 'view-cert/:id', component: Viewcert },
      //Rutas del CMC
      { path: 'calcmc', component: Calcmc },
      { path: 'cmc-params', component: Cmcparams },
      { path: 'cmc-paramsvf', component: Cmcparamsvf },
      { path: 'cmc-resultados', component: Cmcsr },
      { path: 'cmc-view/:id', component: Viewcmc},
      { path: 'cmc-list', component: Listcmc },
      { path: 'cmc-edit', component: Editcmc},



    ]
  },
  // Fallback
  { path: '**', redirectTo: 'inicio' }
];
