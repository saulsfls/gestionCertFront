import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AlertService } from '../../../services/core/alert.service';
import { AuthService } from '../../../services/auth/auth.service';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio {

  private alert = inject(AlertService);
  private auth = inject(AuthService);

  login(){
    if(this.auth.login()){
      this.alert.success('Se ha inciado sesion correctamente','Bienvenido');
    }
  }

  logout(){
    this.auth.logout();
    this.alert.warning('Se ha cerrado la sesion correctamente','Hasta luego');
  }
}
