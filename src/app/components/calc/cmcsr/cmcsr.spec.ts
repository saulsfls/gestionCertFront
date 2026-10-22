import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Cmcsr } from './cmcsr';

describe('Cmcsr', () => {
  let component: Cmcsr;
  let fixture: ComponentFixture<Cmcsr>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Cmcsr],
    }).compileComponents();

    fixture = TestBed.createComponent(Cmcsr);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
