import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Viewtable } from './viewtable';

describe('Viewtable', () => {
  let component: Viewtable;
  let fixture: ComponentFixture<Viewtable>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Viewtable],
    }).compileComponents();

    fixture = TestBed.createComponent(Viewtable);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
