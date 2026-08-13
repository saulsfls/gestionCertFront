import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Viewcert } from './viewcert';

describe('Viewcert', () => {
  let component: Viewcert;
  let fixture: ComponentFixture<Viewcert>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Viewcert],
    }).compileComponents();

    fixture = TestBed.createComponent(Viewcert);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
