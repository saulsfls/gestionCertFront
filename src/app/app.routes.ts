import { Routes } from '@angular/router';
import { Inicio } from './components/inicio/inicio';
import { Newcert } from './components/newcert/newcert';
import { Viewcert } from './components/viewcert/viewcert';
import { Pimage } from './components/pimage/pimage';
import { Editcert } from './components/editcert/editcert';

export const routes: Routes = [
  {path: '',redirectTo: 'inicio', pathMatch: 'full'},
  {path: 'inicio', component: Inicio},
  {path: 'newcert', component: Newcert},
  {path: 'viewcert', component: Viewcert},
  {path: 'pimage', component: Pimage },
  {path: 'editcert', component: Editcert},
  {path: 'editcert/:id', component: Editcert}
];
