import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Viewdata } from './viewdata';

describe('Viewdata', () => {
  let component: Viewdata;
  let fixture: ComponentFixture<Viewdata>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Viewdata],
    }).compileComponents();

    fixture = TestBed.createComponent(Viewdata);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
