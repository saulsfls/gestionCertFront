import { TestBed } from '@angular/core/testing';
import { HojadatosService } from './hojadatos.service';

describe('HojadatosService', () => {
  let service: HojadatosService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HojadatosService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
