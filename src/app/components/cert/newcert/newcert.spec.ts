import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Newcert } from './newcert';

describe('Newcert', () => {
  let component: Newcert;
  let fixture: ComponentFixture<Newcert>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Newcert],
    }).compileComponents();

    fixture = TestBed.createComponent(Newcert);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
