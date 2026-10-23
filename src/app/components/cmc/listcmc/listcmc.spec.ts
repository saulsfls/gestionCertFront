import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Listcmc } from './listcmc';

describe('Listcmc', () => {
  let component: Listcmc;
  let fixture: ComponentFixture<Listcmc>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Listcmc],
    }).compileComponents();

    fixture = TestBed.createComponent(Listcmc);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
