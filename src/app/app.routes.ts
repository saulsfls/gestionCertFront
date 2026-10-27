// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { RenderMode, ServerRoute } from '@angular/ssr';
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
import { Alertconf } from './components/test/alertconf/alertconf';

export const routes: Routes = [
  //Rutas publicas
  { path: 'inicio', component: Inicio, title: 'Gestion de Certificados'},
  { path: 'alert-conf', component: Alertconf, title: 'Configuracion de Alertas'},

  //Rutas privadas protegidas
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full', title: 'Gestion de certificado' },
      //Rutas de componentes de prueba
      { path: 'pimage', component: Pimage, title: 'Prueba de procesamiento de imagen' },
      //Rutas del Certificado
      { path: 'new-cert', component: Newcert, title: 'Nuevo certificado' },
      { path: 'edit-cert/:id', component: Editcert, title: 'Editar Certificado'},
      { path: 'admin-cert', component: admincert, title: 'Administrar Certificados'},
      { path: 'list-cert', component: Listcert,  title: 'Lista de Certificados'},
      { path: 'view-cert/:id', component: Viewcert, title: 'Detalle del Certificado'},
      //Rutas del CMC
      { path: 'calcmc', component: Calcmc, title: 'Modulo de calculo del CMC'},
      { path: 'cmc-params', component: Cmcparams, title: 'Parametros del CMC' },
      { path: 'cmc-paramsvf', component: Cmcparamsvf,  title: 'Parametros del CMC'},
      { path: 'cmc-resultados', component: Cmcsr, title:'Resultados del CMC' },
      { path: 'cmc-view/:id', component: Viewcmc, title: 'Detalle del Calculo'},
      { path: 'cmc-list', component: Listcmc, title: 'Lista de CMC'},
      { path: 'cmc-edit', component: Editcmc, title: 'Editar CMC'},

    ]
  },
  // Fallback
  { path: '**', redirectTo: 'inicio' }
];


