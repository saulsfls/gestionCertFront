import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Cmcs } from './cmcs';

describe('Cmcs', () => {
  let component: Cmcs;
  let fixture: ComponentFixture<Cmcs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Cmcs],
    }).compileComponents();

    fixture = TestBed.createComponent(Cmcs);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
