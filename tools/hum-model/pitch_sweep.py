"""声の高さ(基本周波数)ごとに、上顎洞の栓の動きがどう変わるかを、構えごとに比べる。"""

import nasal_model as m

CONFIGS = {
    'A hum m, nose open': ('m', 'open'),
    'E hum m, nostrils 0.2': ('m', 'narrow:0.2'),
    'B pinch, mouth 0.3': ('open:0.3', 'nostril'),
}
F0S = list(range(90, 351, 20))
reference = m.db(m.harmonic_drive(CONFIGS['A hum m, nose open'], 150, 'maxillary'))

print(f'maxillary resonance {m.MAXILLARY.resonance:.0f} Hz; dB re hum m at f0=150')
print('f0'.ljust(24) + ''.join(f'{f0:>6}' for f0 in F0S))
for name, config in CONFIGS.items():
    row = [m.db(m.harmonic_drive(config, f0, 'maxillary')) - reference for f0 in F0S]
    print(name.ljust(24) + ''.join(f'{v:6.1f}' for v in row))
