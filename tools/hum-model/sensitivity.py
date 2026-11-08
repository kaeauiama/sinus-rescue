"""nasal_model の仮定(鼻腔の損失、副鼻腔の共振の鋭さ、声門の抵抗)を変えても、構えの差が保たれるかを見る。"""

import nasal_model as m

CASES = {
    'B pinch nostrils, mouth 0.3': ('open:0.3', 'nostril'),
    'E nostrils narrowed 0.2': ('m', 'narrow:0.2'),
    'A2 hum ng': ('ng', 'open'),
}
BASE = ('m', 'open')


def gains():
    out = []
    for config in CASES.values():
        for f0 in (110, 150, 220):
            out.append(m.db(m.harmonic_drive(config, f0, 'maxillary')) - m.db(m.harmonic_drive(BASE, f0, 'maxillary')))
    return out


def run(label):
    values = gains()
    print(label.ljust(34) + ''.join(f'{v:7.1f}' for v in values))


print('maxillary plug, dB re hum m'.ljust(34) + ''.join(f'{name[:2] + "@" + str(f0):>7}' for name in CASES for f0 in (110, 150, 220)))
run('default')
for loss in (0.9, 3.6):
    m.LOSS_NASAL = loss
    run(f'nasal loss {loss} /m')
m.LOSS_NASAL = 1.8
for q in (2.0, 8.0):
    m.MAXILLARY = m.Sinus('maxillary', 2 * 15e-6, 2 * 4e-6, 6e-3, q=q)
    run(f'sinus Q {q}')
m.MAXILLARY = m.Sinus('maxillary', 2 * 15e-6, 2 * 4e-6, 6e-3)
for neck in (2e-6, 8e-6):
    m.MAXILLARY = m.Sinus('maxillary', 2 * 15e-6, 2 * neck, 6e-3)
    run(f'ostium {neck * 1e6:.0f} mm2 ({m.MAXILLARY.resonance:.0f} Hz)')
m.MAXILLARY = m.Sinus('maxillary', 2 * 15e-6, 2 * 4e-6, 6e-3)
for r in (3e6, 3e7):
    m.GLOTTAL_R = r
    run(f'glottal R {r:.0e}')
