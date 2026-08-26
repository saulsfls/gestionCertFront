import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Editcert } from './editcert';

describe('Editcert', () => {
  let component: Editcert;
  let fixture: ComponentFixture<Editcert>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Editcert],
    }).compileComponents();

    fixture = TestBed.createComponent(Editcert);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
