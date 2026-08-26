import { Routes } from '@angular/router';
import { Inicio } from './inicio/inicio';
import { Newcert } from './newcert/newcert';
import { Viewcert } from './viewcert/viewcert';
import { Pimage } from './pimage/pimage';
import { Editcert } from './editcert/editcert';

export const routes: Routes = [
  {path: '',redirectTo: 'inicio', pathMatch: 'full'},
  {path: 'inicio', component: Inicio},
  {path: 'newcert', component: Newcert},
  {path: 'viewcert', component: Viewcert},
  {path: 'pimage', component: Pimage },
  {path: 'editcert', component: Editcert},
  {path: 'editcert/:id', component: Editcert}
];
