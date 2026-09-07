import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Listcert } from './listcert';

describe('Listcert', () => {
  let component: Listcert;
  let fixture: ComponentFixture<Listcert>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Listcert],
    }).compileComponents();

    fixture = TestBed.createComponent(Listcert);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
