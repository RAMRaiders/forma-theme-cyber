import json, sys
res = json.load(open(sys.argv[1]))
EU = ['Europe', 'United Kingdom', 'Germany', 'France', 'Spain', 'Italy', 'The Netherlands', 'Sweden', 'Australia', 'World', '', 'North America', 'United States', 'Canada', 'Japan']
NA = ['North America', 'United States', 'Canada', 'World', '', 'Europe', 'United Kingdom', 'Japan']
# American systems, whose European releases (if any) were often other companies' retitled copies.
NA_SYSTEMS = {'atari2600', 'atari5200', 'atari7800', 'atari800', 'xegs', 'colecovision', 'adam', 'intellivision',
              'vectrex', 'apple2', 'apple2gs', 'coco', 'trs80', 'ti99', 'astrocade', 'apfm1000', 'channelf'}
REAL = ['Cart - Front', 'Disc', 'Cart - 3D']
out = {}
for s, r in res.items():
    reg = NA if s in NA_SYSTEMS else EU
    picks = []
    for it in r['items']:
        imgs = it['images']
        real = [i for i in imgs if i[0] in REAL]
        pool = real or [i for i in imgs if i[0] == 'Fanart - Cart - Front']
        if not pool: picks = None; break
        kinds = ['Disc'] if any(i[0] == 'Disc' for i in pool) else REAL + ['Fanart - Cart - Front']
        best = sorted((i for i in pool if i[0] in kinds), key=lambda i: (kinds.index(i[0]), reg.index(i[1]) if i[1] in reg else 99))[0]
        picks.append({'title': it['title'], 'kind': best[0], 'region': best[1], 'file': best[2]})
    # A shelf needs its whole list: ranks with a gap would be wrong.
    if picks: out[s] = {'by': r['by'], 'picks': picks}
json.dump(out, open(sys.argv[2], 'w'), indent=1)
print(len(out), 'systems,', sum(len(v['picks']) for v in out.values()), 'pictures')
