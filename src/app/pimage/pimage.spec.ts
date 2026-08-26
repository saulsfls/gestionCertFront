import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Pimage } from './pimage';

describe('Pimage', () => {
  let component: Pimage;
  let fixture: ComponentFixture<Pimage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Pimage],
    }).compileComponents();

    fixture = TestBed.createComponent(Pimage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
