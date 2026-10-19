import { TestBed } from '@angular/core/testing';

import { CertService } from './cert.service';

describe('CertService', () => {
  let service: CertService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CertService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
