import { TestBed } from '@angular/core/testing';
import { IncCalService } from './inc.cal.service';

describe('IncCalService', () => {
  let service: IncCalService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(IncCalService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
