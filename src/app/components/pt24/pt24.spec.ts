import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Pt24 } from './pt24';

describe('Pt24', () => {
  let component: Pt24;
  let fixture: ComponentFixture<Pt24>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Pt24],
    }).compileComponents();

    fixture = TestBed.createComponent(Pt24);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
