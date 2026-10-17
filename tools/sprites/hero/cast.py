"""
The two duel characters: body (MakeHuman macro sliders + a few shape targets), height, eyes, hair and the costume's
colours. Revenge of the Sith, the Mustafar duel (Obi-Wan without his robe, Anakin in his dark Jedi Knight costume).
Colours are sRGB 0..255 and stay muted ("used universe", ART_GUIDE.md §4).
"""

CAST = {
    'anakin': {
        'height': 1.85,  # Hayden Christensen
        'macro': dict(gender=1.0, age=0.47, muscle=0.64, weight=0.46, height=0.75, proportions=0.8),
        'shape': {
            'head/head-oval': 0.35,
            'head/head-scale-vert-more': 0.12,
            'chin/chin-prominent-more': 0.25,
            'chin/chin-width-max': 0.15,
            'chin/chin-height-max': 0.2,
            'cheek/l-cheek-bones-out': 0.25, 'cheek/r-cheek-bones-out': 0.25,
            'cheek/l-cheek-volume-deflate': 0.3, 'cheek/r-cheek-volume-deflate': 0.3,
            'nose/nose-scale-vert-incr': 0.2,
            'nose/nose-width1-min': 0.2,
            'mouth/mouth-scale-horiz-incr': 0.1,
            'eyebrows/eyebrows-trans-vert-less': 0.25,
            'neck/neck-scale-horiz-more': 0.2,
            'torso/torso-vshape-more': 0.45,
        },
        'eyes': 'bluegreen',
        'brows': 'eyebrows/eyebrow001',
        'brow_color': (78, 56, 38),
        # shoulder length, wavy, dark blond to light brown, parted and swept back from the face
        # (the project's ROTS hair curves, tools/sprites/build_hair.py, fitted to this head)
        'hair': [],
        'hair_curves': 'ep3',
        'hair_color': (124, 90, 56),
        'hair_tip': (156, 116, 74),
        'skin_tint': (1.0, 0.97, 0.95),
        # costume: near-black dark brown leather and wool (Mustafar)
        'costume': 'anakin',
    },
    'obiwan': {
        'height': 1.78,  # Ewan McGregor
        'macro': dict(gender=1.0, age=0.6, muscle=0.56, weight=0.5, height=0.6, proportions=0.65),
        'shape': {
            'head/head-square': 0.25,
            'chin/chin-width-max': 0.2,
            'nose/nose-scale-horiz-incr': 0.1,
            'nose/nose-point-width-more': 0.2,
            'mouth/mouth-lowerlip-volume-inflate': 0.2,
            'eyebrows/eyebrows-angle-down': 0.2,
            'torso/torso-vshape-more': 0.2,
        },
        'eyes': 'lightblue',
        'brows': 'eyebrows/eyebrow001',
        'brow_color': (112, 74, 44),
        # short, swept to the side, auburn brown; a short full beard and moustache
        'hair': [{'proxy': 'hair/short02/short02.json', 'color': 'hair'},
                 {'proxy': 'hair/Full_beard/Full_beard.json', 'color': 'beard'},
                 {'proxy': 'hair/Moustache/Moustache.json', 'color': 'beard'}],
        'hair_color': (92, 58, 34),
        'hair_tip': (120, 80, 50),
        'beard_color': (100, 66, 40),
        'groom': 'obiwan',  # strands grown on the hair and beard proxies (groom.py)
        'skin_tint': (1.0, 0.96, 0.93),
        'costume': 'obiwan',
    },
}
