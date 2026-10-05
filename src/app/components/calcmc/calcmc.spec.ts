import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Calcmc } from './calcmc';

describe('Calcmc', () => {
  let component: Calcmc;
  let fixture: ComponentFixture<Calcmc>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Calcmc],
    }).compileComponents();

    fixture = TestBed.createComponent(Calcmc);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
