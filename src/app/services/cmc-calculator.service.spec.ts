import { TestBed } from '@angular/core/testing';

import { CmcCalculatorService } from './cmc-calculator.service';

describe('CmcCalculatorService', () => {
  let service: CmcCalculatorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CmcCalculatorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
