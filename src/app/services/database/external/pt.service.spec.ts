import { TestBed } from '@angular/core/testing';
import { PtService } from './pt.service';

describe('PtService', () => {
  let service: PtService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PtService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
