import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Admininc } from './admininc';

describe('Admininc', () => {
  let component: Admininc;
  let fixture: ComponentFixture<Admininc>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Admininc],
    }).compileComponents();

    fixture = TestBed.createComponent(Admininc);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
