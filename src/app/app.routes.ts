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
import { Cmcparamsvf } from './components/cmc/cmcparamsvf/cmcparamsvf';
import { Viewcmc } from './components/cmc/viewcmc/viewcmc';
import { Listcmc } from './components/cmc/listcmc/listcmc';
import { Editcmc } from './components/cmc/editcmc/editcmc';
import { Alertconf } from './components/test/alertconf/alertconf';
import { Viewdata } from './components/test/viewdata/viewdata';
import { Cmcsr } from './components/cmc/cmcsr/cmcsr';

export const routes: Routes = [
  //Rutas publicas
  { path: '', component: Inicio, title: 'Gestion de Certificados'},
  { path: 'inicio', component: Inicio, title: 'Gestion de Certificados'},
  { path: 'alert-conf', component: Alertconf, title: 'Configuracion de Alertas'},

  //Rutas privadas protegidas
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      //Rutas de componentes de prueba
      { path: 'pimage', component: Pimage, title: 'Procesamiento de imagen' },
      { path: 'view-data', component: Viewdata, title: 'Muestra de datos'},
      //Rutas del Certificado
      { path: 'new-cert', component: Newcert, title: 'Nuevo certificado' },
      { path: 'edit-cert/:id', component: Editcert, title: 'Editar Certificado'},
      { path: 'admin-cert', component: admincert, title: 'Administrar Certificados'},
      { path: 'list-cert', component: Listcert,  title: 'Lista de Certificados'},
      { path: 'view-cert/:id', component: Viewcert, title: 'Detalle del Certificado'},
      //Rutas del CMC
      { path: 'calcmc', component: Calcmc, title: 'Modulo de calculo del CMC'},
      { path: 'cmc-create', component: Cmcparamsvf,  title: 'Parametros del CMC'},
      { path: 'cmc-view/:id', component: Viewcmc, title: 'Detalle del Calculo'},
      { path: 'cmc-view', component: Viewcmc, title: 'Detalle del Calculo'},
      { path: 'cmc-results', component: Cmcsr, title: 'Detalle y guardado del calculo del CMC'},
      { path: 'cmc-list', component: Listcmc, title: 'Lista de CMC'},
      { path: 'cmc-edit', component: Editcmc, title: 'Editar CMC'},
    ]
  },
  // Fallback
  { path: '**', redirectTo: 'inicio' }
];


