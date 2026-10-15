import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cmcparamsvf } from './cmcparamsvf';

describe('Cmcparamsvf', () => {
  let component: Cmcparamsvf;
  let fixture: ComponentFixture<Cmcparamsvf>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Cmcparamsvf],
    }).compileComponents();

    fixture = TestBed.createComponent(Cmcparamsvf);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
