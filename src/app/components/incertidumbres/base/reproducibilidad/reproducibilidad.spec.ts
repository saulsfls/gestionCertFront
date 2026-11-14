import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Reproducibilidad } from './reproducibilidad';

describe('Reproducibilidad', () => {
  let component: Reproducibilidad;
  let fixture: ComponentFixture<Reproducibilidad>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Reproducibilidad],
    }).compileComponents();

    fixture = TestBed.createComponent(Reproducibilidad);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
