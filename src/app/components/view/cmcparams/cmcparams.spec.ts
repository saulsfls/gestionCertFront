import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Cmcparams } from './cmcparams';

describe('Cmcparams', () => {
  let component: Cmcparams;
  let fixture: ComponentFixture<Cmcparams>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Cmcparams],
    }).compileComponents();

    fixture = TestBed.createComponent(Cmcparams);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
