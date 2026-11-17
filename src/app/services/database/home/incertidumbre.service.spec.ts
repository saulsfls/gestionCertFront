import { TestBed } from '@angular/core/testing';
import { IncertidumbreService } from './incertidumbre.service';

describe('IncertidumbreService', () => {
  let service: IncertidumbreService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(IncertidumbreService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
