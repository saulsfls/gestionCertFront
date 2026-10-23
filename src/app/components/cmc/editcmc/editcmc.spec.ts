import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Editcmc } from './editcmc';

describe('Editcmc', () => {
  let component: Editcmc;
  let fixture: ComponentFixture<Editcmc>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Editcmc],
    }).compileComponents();

    fixture = TestBed.createComponent(Editcmc);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
