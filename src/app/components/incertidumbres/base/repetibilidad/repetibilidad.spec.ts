import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Repetibilidad } from './repetibilidad';

describe('Repetibilidad', () => {
  let component: Repetibilidad;
  let fixture: ComponentFixture<Repetibilidad>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Repetibilidad],
    }).compileComponents();

    fixture = TestBed.createComponent(Repetibilidad);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
