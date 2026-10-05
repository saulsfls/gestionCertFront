import { Routes } from '@angular/router';
import { Inicio } from './components/inicio/inicio';
import { Newcert } from './components/newcert/newcert';
import { Viewcert } from './components/viewcert/viewcert';
import { Pimage } from './components/pimage/pimage';
import { Editcert } from './components/editcert/editcert';
import { admincert } from './components/admincert/admincert';
import { Listcert } from './components/listcert/listcert';

export const routes: Routes = [
  {path: '',redirectTo: 'inicio', pathMatch: 'full'},
  {path: 'inicio', component: Inicio},
  {path: 'newcert', component: Newcert},
  {path: 'pimage', component: Pimage },
  {path: 'editcert/:id', component: Editcert},//Solo se puede acceder a la ruta con un id de certificado
  {path: 'admincert', component: admincert},
  {path: 'listcert', component: Listcert},
  {path: 'viewcert/:id', component: Viewcert},//Solo se puede acceder a la ruta con un id de certificado
];
