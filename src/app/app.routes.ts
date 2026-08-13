import { Routes } from '@angular/router';
import { Inicio } from './inicio/inicio';
import { Newcert } from './newcert/newcert';

export const routes: Routes = [
  {path: '',redirectTo: 'inicio', pathMatch: 'full'},
  {path: 'inicio', component: Inicio},
  {path: 'newcert', component: Newcert}
];
