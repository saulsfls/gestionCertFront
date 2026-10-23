import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Viewcmc } from './viewcmc';

describe('Viewcmc', () => {
  let component: Viewcmc;
  let fixture: ComponentFixture<Viewcmc>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Viewcmc],
    }).compileComponents();

    fixture = TestBed.createComponent(Viewcmc);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
