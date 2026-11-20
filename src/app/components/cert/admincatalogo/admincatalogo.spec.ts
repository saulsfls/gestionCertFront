import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Admincatalogo } from './admincatalogo';

describe('Admincatalogo', () => {
  let component: Admincatalogo;
  let fixture: ComponentFixture<Admincatalogo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Admincatalogo],
    }).compileComponents();

    fixture = TestBed.createComponent(Admincatalogo);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
