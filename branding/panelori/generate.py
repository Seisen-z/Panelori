from pathlib import Path
import json

R = Path(__file__).resolve().parent
INK, MINT, PAPER, TEAL = '#143C3B', '#63E6C3', '#F1F7F4', '#177D70'
word = json.loads((R / 'wordmark-path.json').read_text(encoding='utf-8-sig'))
b = word['bounds']
BODY = 'M20 10H51V27C51 33 55 37 61 37H78V54C78 65.046 69.046 74 58 74H40V88H20Z'
PANELS = 'M36 28H45V49H36ZM53 42H62V49H53ZM36 56H62V60C62 62.209 60.209 64 58 64H36Z'
FOLD = 'M57 12L76 31H62C59.239 31 57 28.761 57 26Z'

def mark(color=TEAL, fold=None, small=False):
    holes = 'M36 30H45V49H36ZM36 56H62V64H36Z' if small else PANELS
    return f'<path fill="{color}" fill-rule="evenodd" d="{BODY + holes}"/><path fill="{fold or color}" d="{FOLD}"/>'

def svg(body, box, name):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}" role="img" aria-labelledby="title"><title id="title">{name}</title>{body}</svg>\n'''

def wm(color=INK, width=450):
    s=width/b['width']
    return f'<g transform="scale({s}) translate({-b["x"]} {-b["y"]})"><path fill="{color}" d="{word["path"]}"/></g>'

assets = {}
for suffix,color in [('teal',TEAL),('mint',MINT),('black','#000000'),('white','#FFFFFF')]:
    assets[f'panelori-mark-{suffix}.svg']=svg(mark(color),'0 0 96 96','Panelori folded-panel P symbol')
assets['panelori-mark-small.svg']=svg(mark(TEAL,small=True),'0 0 96 96','Panelori optically simplified small symbol')
for suffix,color,accent in [('light',INK,TEAL),('dark','#FFFFFF',MINT)]:
    body=f'<g transform="translate(0 4) scale(1.08)">{mark(accent)}</g><g transform="translate(126 19)">{wm(color,420)}</g>'
    assets[f'panelori-logo-{suffix}.svg']=svg(body,'0 0 570 112','Panelori horizontal logo, '+suffix+' backgrounds')
assets['panelori-app-icon.svg']=svg(f'<rect width="128" height="128" rx="29" fill="{INK}"/><g transform="translate(16 16)">{mark(MINT)}</g>','0 0 128 128','Panelori app icon')
for name,data in assets.items(): (R/name).write_text(data,encoding='utf8',newline='\n')

def text(x,y,t,size=18,color=INK,extra=''):
    return f'<text x="{x}" y="{y}" fill="{color}" font-family="Segoe UI, sans-serif" font-size="{size}" {extra}>{t}</text>'

board=f'<rect width="1440" height="960" fill="{PAPER}"/>'
board+=text(64,62,'PANELORI  /  IDENTITY PROPOSAL',17,TEAL,'letter-spacing="2"')
board+=text(1376,62,'MANGA · MANHWA · COMICS',15,TEAL,'text-anchor="end" letter-spacing="1.3"')
board+=f'<path d="M64 88H1376" stroke="#C6DCD3"/>'
board+=f'<rect x="64" y="128" width="446" height="460" fill="{INK}"/>'
board+=f'<g transform="translate(118 179) scale(3.5)">{mark(MINT)}</g>'
board+=f'<g transform="translate(578 208)">{wm(INK,700)}</g>'
board+=text(582,396,'A new home for your next chapter.',28,TEAL)
board+=text(582,452,'Comic panels. A folded page. One unmistakable P.',19)
board+=text(582,485,'Original geometry · editable SVG · no embedded images',18,TEAL)
board+=text(582,558,'pan-ell-or-ee',18,TEAL,'letter-spacing="1"')
board+=f'<path d="M64 634H1376" stroke="#C6DCD3"/>'
board+=text(64,681,'APP ICON',14,TEAL,'letter-spacing="2"')
board+=f'<g transform="translate(64 713)"><rect width="154" height="154" rx="35" fill="{INK}"/><g transform="translate(19 19) scale(1.21)">{mark(MINT)}</g></g>'
board+=text(292,681,'SMALL-SIZE SILHOUETTE',14,TEAL,'letter-spacing="2"')
for x,size in [(292,24),(360,32),(444,48),(548,64)]:
    board+=f'<g transform="translate({x} {788-size}) scale({size/96})">{mark(TEAL,small=size<32)}</g>'
    board+=text(x,827,str(size)+' px',13,TEAL)
board+=text(708,681,'ONE COLOUR',14,TEAL,'letter-spacing="2"')
board+=f'<g transform="translate(708 724) scale(1.45)">{mark(INK)}</g>'
board+=f'<rect x="914" y="708" width="160" height="160" fill="{INK}"/><g transform="translate(924 719) scale(1.45)">{mark("#FFFFFF")}</g>'
for x,c,label in [(1142,TEAL,'Panel teal'),(1220,MINT,'Fresh mint'),(1298,INK,'Deep ink')]:
    board+=f'<rect x="{x}" y="728" width="62" height="62" rx="6" fill="{c}"/>'
    board+=text(x,819,label,11)+text(x,838,c,11,TEAL)
board+=text(64,922,'BRAND PROPOSAL ONLY — the running app and your personal library are unchanged.',15,TEAL)
(R/'panelori-presentation.svg').write_text(svg(board,'0 0 1440 960','Panelori brand presentation'),encoding='utf8',newline='\n')
(R/'preview.html').write_text('<!doctype html><html><head><meta charset="utf-8"><title>Panelori identity</title><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>html,body{margin:0;width:1440px;height:960px;overflow:hidden}svg{display:block;width:1440px;height:960px}</style></head><body>'+svg(board,'0 0 1440 960','Panelori brand presentation')+'</body></html>',encoding='utf8')
(R/'README.md').write_text('''# Panelori — rebrand proposal

Recommended name: **Panelori** (pan-ell-or-ee). A coined name combining the idea of comic panels with folded paper/origami. This is a creative interpretation, not a claimed Japanese translation.

The signature is a geometric P made from a comic page: three differently sized negative-space panels and an isolated folded corner. The P connects the name and the reading product without copying Mihon's mark.

## Assets
- `panelori-mark-teal.svg`: primary standalone symbol, transparent background.
- `panelori-mark-mint.svg`: reverse accent for dark backgrounds.
- `panelori-mark-black.svg` and `panelori-mark-white.svg`: single-colour versions.
- `panelori-mark-small.svg`: optically simplified symbol for 16–24px use.
- `panelori-logo-light.svg` and `panelori-logo-dark.svg`: horizontal logo lockups; transparent backgrounds.
- `panelori-app-icon.svg`: complete rounded-square app icon.
- `panelori-presentation.svg` / `panelori-preview.png`: overview and previews at small sizes.

All production SVG assets use vector paths, with no raster content, external references or font dependencies. The wordmark is outlined from locally installed Bahnschrift; the symbol is custom geometry. Presentation labels remain editable SVG text. No tracing, AI bitmap or image upscaling was used.

Palette: Panel teal #177D70; Fresh mint #63E6C3; Deep ink #143C3B; Paper #F1F7F4. Use teal/ink on light surfaces and mint/white on dark surfaces. Keep one-quarter symbol width clear space around the mark. Do not stretch, rotate or add glow/shadows. Keep the full name out of small app icons.

The application name, executable, installer identity and profile directory are unchanged. These files are a proposal, not an installed app rebrand. Basic exact-name web searches did not establish exclusivity, registration or domain availability. Panelune was rejected because an existing comics-reader listing already uses that name: https://apps.apple.com/in/app/panelune/id6807220447 .
''',encoding='utf8',newline='\n')
print('GENERATED: '+str(len(assets))+' production vector SVG assets + presentation')
