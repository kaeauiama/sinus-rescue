"""ハミング中の鼻腔と副鼻腔の、1次元の音響モデル(調査用)。

声帯から咽頭、口腔、鼻腔をつないだ管と、副鼻腔のヘルムホルツ共鳴器を伝送線路で計算する。
構えの違い(口を閉じる、鼻をつまむ位置、口の開き)で、副鼻腔の開口部にかかる圧力の振れと、
開口部の空気の栓が動く量がどう変わるかを比べる。

寸法と損失は文献のおおよその値を当てはめた仮の値で、個人の値ではない。
絶対値ではなく、構えどうしの相対的な差(dB)だけを読むこと。
"""

import numpy as np

RHO = 1.14  # 呼気の密度 kg/m^3(体温、湿潤)
C = 350.0  # 音速 m/s(体温)
GLOTTAL_R = 8e6  # 声門の抵抗 Pa·s/m^3(声帯を有限の音源として扱う)

# 損失。500Hzでの減衰 1/m。帯域幅 B ≈ αc/π から、母音は約60Hz、鼻音は約200Hzになるよう決めた。
LOSS_ORAL = 0.55
LOSS_NASAL = 1.8

CM = 0.01
CM2 = 1e-4


def tube_matrix(length, area, f, loss):
    gamma = 1j * 2 * np.pi * f / C + loss * np.sqrt(f / 500)
    z0 = RHO * C / area
    ch, sh = np.cosh(gamma * length), np.sinh(gamma * length)
    return np.array([[ch, z0 * sh], [sh / z0, ch]])


def radiation(area, f):
    # 開いた管端(フランジなし)
    k = 2 * np.pi * f / C
    a = np.sqrt(area / np.pi)
    return RHO * C / area * (0.25 * (k * a) ** 2 + 1j * 0.61 * k * a)


def soft_wall(area, f, mass=15.0, resistance=1e4, stiffness=4e6):
    # 軟組織の壁(Ishizaka 1975 の頬の値: 1.5 g/cm^2、1000 dyn·s/cm^3、4e5 dyn/cm^3)
    w = 2 * np.pi * f
    return (resistance + 1j * w * mass + stiffness / (1j * w)) / area


def orifice(length, area, f):
    # 細い通り道(唇のすき間、鼻孔の狭め)。慣性と放射だけを入れる。
    w = 2 * np.pi * f
    return 1j * w * RHO * (length + 1.7 * np.sqrt(area / np.pi)) / area + radiation(area, f)


def parallel(*impedances):
    return 1 / sum(1 / z for z in impedances)


class Sinus:
    def __init__(self, name, volume, neck_area, neck_length, q=4.0):
        self.name = name
        self.volume = volume
        self.neck_area = neck_area
        self.neck_length = neck_length
        self.q = q
        a = np.sqrt(neck_area / np.pi)
        self.mass = RHO * (neck_length + 1.7 * a) / neck_area
        self.compliance = volume / (RHO * C**2)
        self.resistance = np.sqrt(self.mass / self.compliance) / q

    @property
    def resonance(self):
        return 1 / (2 * np.pi * np.sqrt(self.mass * self.compliance))

    def impedance(self, f):
        w = 2 * np.pi * f
        return self.resistance + 1j * w * self.mass + 1 / (1j * w * self.compliance)


# 左右をまとめて1本の管として扱うので、副鼻腔も左右の合計にする(共振周波数は片側と同じ)。
MAXILLARY = Sinus('maxillary', 2 * 15e-6, 2 * 4e-6, 6e-3)
SPHENOID = Sinus('sphenoid', 2 * 4e-6, 2 * 3e-6, 4e-3)


PORT_AREA = [1.0]  # 軟口蓋の開き cm^2。checks() で変える。


def tube(length, area, loss, step=0.5 * CM):
    n = max(1, int(round(length / step)))
    return [('tube', length / n, area, loss)] * n


def nasal_chain(end):
    """軟口蓋の開き(1cm)から鼻孔までの要素。end で鼻先の状態を選ぶ。

    位置は軟口蓋の開きの出口から測る。蝶形骨洞は2.5cm、上顎洞(中鼻道)は5.5cm、
    鼻腔の前端(鼻前庭の入口)は8.5cm、鼻孔は10cm。
    """
    chain = tube(1 * CM, PORT_AREA[0] * CM2, LOSS_NASAL)
    chain += tube(2.5 * CM, 2.5 * CM2, LOSS_NASAL) + [('sinus', SPHENOID)]
    chain += tube(3.0 * CM, 2.5 * CM2, LOSS_NASAL) + [('sinus', MAXILLARY)]
    if end in ('root_sealed', 'root_leaky'):
        chain += tube(1.5 * CM, 2.5 * CM2, LOSS_NASAL)
        return chain, end
    chain += tube(3.0 * CM, 2.5 * CM2, LOSS_NASAL)
    if end == 'ala':
        return chain, end
    # 鼻前庭。壁が柔らかいので、途中に軟組織の壁をつなぐ。
    chain += tube(0.75 * CM, 1.2 * CM2, LOSS_NASAL) + [('wall', 5 * CM2)] + tube(0.75 * CM, 1.2 * CM2, LOSS_NASAL)
    return chain, end


def nasal_end_impedance(end, f):
    if end == 'open':
        return radiation(1.2 * CM2, f)
    if end.startswith('narrow'):
        area = float(end.split(':')[1]) if ':' in end else 0.2
        return orifice(1 * CM, area * CM2, f)
    if end == 'nostril':
        # 指で押さえた鼻孔。柔らかい蓋として扱う。
        return soft_wall(1.2 * CM2, f)
    if end == 'ala':
        # 小鼻を押しつぶした面。押しつぶされて硬くなるので、こわさを3倍にする。
        return soft_wall(1.0 * CM2, f, stiffness=1.2e7)
    if end == 'root_sealed':
        return soft_wall(1.0 * CM2, f, stiffness=1.2e7)
    if end == 'root_leaky':
        # 付け根は骨に近く、閉じきれずに細いすき間が残る場合。
        return parallel(soft_wall(1.0 * CM2, f, stiffness=1.2e7), orifice(0.5 * CM, 0.05 * CM2, f))
    raise ValueError(end)


def oral_chain(mode):
    if mode == 'm':
        # 唇を閉じる。口腔全体が閉じた枝管になる。頬は柔らかい壁。
        return tube(4 * CM, 3 * CM2, LOSS_ORAL) + [('wall', 15 * CM2)] + tube(4 * CM, 3 * CM2, LOSS_ORAL), 'closed'
    if mode == 'ng':
        # 舌の奥で閉じる。枝管はほぼなくなる。
        return tube(0.5 * CM, 2 * CM2, LOSS_ORAL), 'closed'
    if mode.startswith('open'):
        return tube(8 * CM, 3 * CM2, LOSS_ORAL), mode
    raise ValueError(mode)


def oral_end_impedance(end, f):
    if end == 'closed':
        return 1e14
    area = float(end.split(':')[1]) * CM2
    return orifice(1 * CM, area, f)


def element_matrix(element, f):
    kind = element[0]
    if kind == 'tube':
        return tube_matrix(element[1], element[2], f, element[3])
    if kind == 'sinus':
        return element[1].impedance(f)
    if kind == 'wall':
        return soft_wall(element[1], f)
    raise ValueError(kind)


def input_impedance(chain, end_impedance, f):
    z = end_impedance
    for element in reversed(chain):
        m = element_matrix(element, f)
        if element[0] == 'tube':
            z = (m[0, 0] * z + m[0, 1]) / (m[1, 0] * z + m[1, 1])
        else:
            z = parallel(z, m)
    return z


def forward(chain, p, u, f):
    """入口の圧と体積速度から、各要素の位置の圧と、枝へ流れる体積速度を順に求める。"""
    position = 0.0
    points = [(0.0, p, None)]
    branch_flow = {}
    for element in chain:
        m = element_matrix(element, f)
        if element[0] == 'tube':
            p, u = np.linalg.solve(m, np.array([p, u]))
            position += element[1]
            points.append((position, p, None))
        else:
            flow = p / m
            u = u - flow
            if element[0] == 'sinus':
                branch_flow[element[1].name] = (p, flow)
    return points, branch_flow, (p, u)


PHARYNX = tube(9 * CM, 3 * CM2, LOSS_ORAL)

CONFIGS = {
    'A  hum m (lips closed, nose open)': ('m', 'open'),
    'A2 hum ng (tongue back, nose open)': ('ng', 'open'),
    'E  hum m, nostrils narrowed': ('m', 'narrow'),
    'B  pinch nostrils, mouth 0.3cm2': ('open:0.3', 'nostril'),
    'C  pinch alae, mouth 0.3cm2': ('open:0.3', 'ala'),
    'D1 pinch root sealed, mouth 0.3cm2': ('open:0.3', 'root_sealed'),
    'D2 pinch root leaky, mouth 0.3cm2': ('open:0.3', 'root_leaky'),
}


def solve(config, f):
    oral_mode, nasal_end = config
    o_chain, o_end = oral_chain(oral_mode)
    n_chain, n_end = nasal_chain(nasal_end)
    z_oral = input_impedance(o_chain, oral_end_impedance(o_end, f), f)
    z_nasal = input_impedance(n_chain, nasal_end_impedance(n_end, f), f)
    z_junction = parallel(z_oral, z_nasal)
    z_glottis = input_impedance(PHARYNX, z_junction, f)
    u_glottis = GLOTTAL_R / (GLOTTAL_R + z_glottis)  # 音源の体積速度を1とする
    p_glottis = u_glottis * z_glottis
    _, _, (p_j, _) = forward(PHARYNX, p_glottis, u_glottis, f)
    points, sinus_flow, (p_end, u_end) = forward(n_chain, p_j, p_j / z_nasal, f)
    return {'p_junction': p_j, 'points': points, 'sinus': sinus_flow, 'nasal_out': u_end}


def db(x):
    return 20 * np.log10(np.abs(x))


def harmonic_drive(config, f0, sinus, max_f=1500):
    # 声の音源は倍音ごとに約 -12dB/oct で弱くなるとして、栓の動き(体積変位)の二乗和をとる。
    total = 0.0
    n = 1
    while n * f0 <= max_f:
        f = n * f0
        flow = solve(config, f)['sinus'][sinus][1]
        displacement = abs(flow) / (2 * np.pi * f)
        total += (displacement / n**2) ** 2
        n += 1
    return np.sqrt(total)


def main():
    print(f'maxillary resonance {MAXILLARY.resonance:.0f} Hz, sphenoid resonance {SPHENOID.resonance:.0f} Hz')
    names = list(CONFIGS)
    base = CONFIGS[names[0]]

    print('\n[1] pressure at the maxillary ostium, dB re config A at the same frequency')
    freqs = [110, 150, 220, 330, 450, 640, 800, 1000]
    print('config'.ljust(38) + ''.join(f'{f:>7}' for f in freqs))
    for name in names:
        row = [db(solve(CONFIGS[name], f)['sinus']['maxillary'][0]) - db(solve(base, f)['sinus']['maxillary'][0]) for f in freqs]
        print(name.ljust(38) + ''.join(f'{v:7.1f}' for v in row))

    print('\n[2] plug displacement driven by a whole hum (harmonics -12 dB/oct), dB re config A')
    print('config'.ljust(38) + ''.join(f'{s + "@" + str(f0):>16}' for s in ('maxillary', 'sphenoid') for f0 in (110, 150, 220)))
    for name in names:
        row = []
        for s in ('maxillary', 'sphenoid'):
            for f0 in (110, 150, 220):
                row.append(db(harmonic_drive(CONFIGS[name], f0, s)) - db(harmonic_drive(base, f0, s)))
        print(name.ljust(38) + ''.join(f'{v:16.1f}' for v in row))

    print('\n[3] pressure along the nasal tract at 150 Hz, relative to pressure at the velopharyngeal port')
    for name in (names[0], names[3], names[4]):
        result = solve(CONFIGS[name], 150)
        p0 = abs(result['points'][0][1])
        samples = [(x, abs(p) / p0) for x, p, _ in result['points']]
        marks = [0, 2.5, 5.5, 8.5, 10]
        values = []
        for target in marks:
            near = min(samples, key=lambda s: abs(s[0] - (target + 1) * CM))
            values.append(near[1])
        print(name.ljust(38) + '  '.join(f'{m}cm:{v:.2f}' for m, v in zip(marks, values)))

    print('\n[4] mouth opening while the nostrils are pinched (plug displacement, maxillary, f0=150), dB re config A')
    for area in (0.1, 0.3, 1.0, 3.0):
        cfg = (f'open:{area}', 'nostril')
        print(f'  mouth {area:>4} cm2: {db(harmonic_drive(cfg, 150, "maxillary")) - db(harmonic_drive(base, 150, "maxillary")):6.1f} dB')

    print('\n[5] steady flow 0.15 L/s: mean pressure behind the outlet and share of flow through the nose')
    flow = 0.15e-3
    outlets = {
        'A  nose open (1.2 cm2)': (1.2, None),
        'E  nostrils narrowed (0.2 cm2)': (0.2, None),
        'B/C/D1 mouth 0.3 cm2, nose sealed': (None, 0.3),
        'D2 mouth 0.3 cm2 + nose leak 0.05 cm2': (0.05, 0.3),
        'B  mouth 0.1 cm2, nose sealed': (None, 0.1),
    }
    for name, (nose, mouth) in outlets.items():
        areas = [a for a in (nose, mouth) if a]
        total = sum(areas) * CM2
        v = flow / total
        dp = 0.5 * RHO * v**2 / 0.6**2  # 縮流係数0.6
        share = (nose or 0) / sum(areas)
        print(f'  {name.ljust(40)} {dp:6.0f} Pa ({dp / 98.1:4.1f} cmH2O), nasal share {share:4.0%}')


def checks():
    base = CONFIGS['A  hum m (lips closed, nose open)']
    print('\n[6] sanity check: sound leaving the nostrils during hum m (dB re 110 Hz)')
    freqs = list(range(100, 1501, 50))
    out = [db(solve(base, f)['nasal_out']) for f in freqs]
    ref = out[0]
    peak = freqs[int(np.argmax(out[:8]))]
    dip = freqs[6 + int(np.argmin(out[6:]))]
    print('  ' + ' '.join(f'{f}:{v - ref:+.0f}' for f, v in zip(freqs, out)))
    print(f'  lowest peak {peak} Hz (nasal murmur ~250-300 Hz expected), deepest dip above 400 Hz at {dip} Hz')

    print('\n[7] how much the nostrils are narrowed while humming m (maxillary plug, f0=150) and mean pressure at 0.15 L/s')
    reference = db(harmonic_drive(base, 150, 'maxillary'))
    for area in (0.6, 0.4, 0.2, 0.1):
        gain = db(harmonic_drive(('m', f'narrow:{area}'), 150, 'maxillary')) - reference
        dp = 0.5 * RHO * (0.15e-3 / (area * CM2)) ** 2 / 0.6**2
        print(f'  nostril area {area:>4} cm2: {gain:5.1f} dB, mean pressure {dp / 98.1:4.1f} cmH2O')

    print('\n[8] opening of the soft palate (maxillary plug, f0=150), dB re config A with a 1.0 cm2 port')
    pinched = CONFIGS['B  pinch nostrils, mouth 0.3cm2']
    for area in (0.3, 0.6, 1.0, 2.0):
        PORT_AREA[0] = area
        a = db(harmonic_drive(base, 150, 'maxillary')) - reference
        b = db(harmonic_drive(pinched, 150, 'maxillary')) - reference
        print(f'  port {area:>3} cm2: hum m {a:5.1f} dB, pinched {b:5.1f} dB')
    PORT_AREA[0] = 1.0


if __name__ == '__main__':
    main()
    checks()
