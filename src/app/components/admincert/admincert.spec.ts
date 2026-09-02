import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Admincert } from './admincert';

describe('Admincert', () => {
  let component: Admincert;
  let fixture: ComponentFixture<Admincert>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Admincert],
    }).compileComponents();

    fixture = TestBed.createComponent(Admincert);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
