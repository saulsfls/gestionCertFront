import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Alertconf } from './alertconf';

describe('Alertconf', () => {
  let component: Alertconf;
  let fixture: ComponentFixture<Alertconf>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Alertconf],
    }).compileComponents();

    fixture = TestBed.createComponent(Alertconf);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
