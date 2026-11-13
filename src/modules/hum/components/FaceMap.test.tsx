import { fireEvent, render, screen } from '@testing-library/preact';
import { unmountAll } from '../../../platform/testing';
import { SITES } from '../domain/sites';
import { FaceMap } from './FaceMap';

afterEach(unmountAll);

describe('副鼻腔の図(D-040)', () => {
  it('図を出し、どの部位も図の上で押して選べる', () => {
    const onPick = vi.fn();
    const { container } = render(<FaceMap onPick={onPick} />);
    expect(screen.getByAltText(/副鼻腔のおおよその位置を示す図/)).toBeTruthy();
    for (const site of SITES) {
      const zone = container.querySelector(`.zone[data-site="${site.id}"]`);
      expect(zone?.querySelectorAll('path').length).toBeGreaterThan(0);
      fireEvent.click(zone?.querySelector('path') as Element);
      expect(onPick).toHaveBeenLastCalledWith(site.id);
    }
  });
});
