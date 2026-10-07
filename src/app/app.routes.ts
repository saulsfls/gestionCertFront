import { Routes } from '@angular/router';
import { Newcert } from './components/modules/newcert/newcert';
import { Viewcert } from './components/view/viewcert/viewcert';
import { Pimage } from './components/test/pimage/pimage';
import { Editcert } from './components/modules/editcert/editcert';
import { admincert } from './components/modules/admincert/admincert';
import { Listcert } from './components/view/listcert/listcert';
import { Calcmc } from './components/cmc/calcmc/calcmc';

export const routes: Routes = [
  {path: '',redirectTo: 'inicio', pathMatch: 'full'},
  {path: 'newcert', component: Newcert},
  {path: 'pimage', component: Pimage },
  {path: 'editcert/:id', component: Editcert},//Solo se puede acceder a la ruta con un id de certificado
  {path: 'admincert', component: admincert},
  {path: 'listcert', component: Listcert},
  {path: 'viewcert/:id', component: Viewcert},//Solo se puede acceder a la ruta con un id de certificado
  {path: 'calcmc', component: Calcmc},//Solo se puede acceder a la ruta con un id de certificado
];
