# Plan de fusión de venues (dry-run local con datos de prod, 2026-10-02)

Generado corriendo las migraciones 20261002190000/190100 con ROLLBACK. Decisiones (2026-10-02): renombres aprobados; "Don Emilio" y "Balcarce 980" (→ Live Fresh, inferido) quedan en revisión manual; El Patio de la Roka quedó separado de La Roka en esta migración; después se decidió que es parte de La Roka y se fusionó en 20261002200000_venue_patio_roka.sql (3 eventos, rollback en supabase/rollbacks/). Probado en local con datos de prod: aplicar + rollback deja venues, events.venue_id y los defaults de Instagram con la misma huella que antes.

```
MERGE | 30 y Pico | <- | 30 y Pico Salta | eventos=1 | address=30 y Pico
MERGE | 30 y Pico | <- | Treinta y Pico | eventos=0 | address=30 y Pico
MERGE | 30 y Pico | <- | Treinta y Pico Salta | eventos=0 | address=30 y Pico
MERGE | 30 y Pico | <- | Treintaypico | eventos=0 | address=30 y Pico
MERGE | 30 y Pico | <- | Balcarce 865 | eventos=5 | address=Balcarce 865
MERGE | Amnesia Pub & Música | <- | Amnesia | eventos=11 | address=Amnesia Pub & Música
MERGE | Amnesia Pub & Música | <- | Amnesia Salta | eventos=3 | address=Amnesia Pub & Música
MERGE | Amnesia Pub & Música | <- | Amnesia Pub & Music | eventos=6 | address=Amnesia Pub & Música
MERGE | Amnesia Pub & Música | <- | Balcarce 899 | eventos=3 | address=Balcarce 899
MERGE | Autódromo de Salta | <- | Autodromo de Salta | eventos=1 | address=Autódromo de Salta
MERGE | Babylon | <- | Babylon Salta | eventos=13 | address=Babylon
MERGE | Babylon | <- | Espacio Babylon | eventos=1 | address=Babylon
MERGE | Babylon | <- | Necochea 719 | eventos=3 | address=Necochea 719
MERGE | Balderrama | <- | Peña Boliche Balderrama | eventos=3 | address=Av. San Martín 1126, Salta
MERGE | Balderrama | <- | Av. San Martín 1126 | eventos=1 | address=Av. San Martín 1126, Salta
MERGE | Bounce | <- | Bounce Salta | eventos=6 | address=Bounce
MERGE | Bounce | <- | Las Heras 1237 | eventos=2 | address=Las Heras 1237
MERGE | Bunker Owl Music Bar | <- | Bunker | eventos=4 | address=Bunker Owl Music Bar
MERGE | Bunker Owl Music Bar | <- | Búnker | eventos=0 | address=Bunker Owl Music Bar
MERGE | Bunker Owl Music Bar | <- | Bunker Owl | eventos=0 | address=Bunker Owl Music Bar
MERGE | Bunker Owl Music Bar | <- | Balcarce 926 | eventos=3 | address=Balcarce 926
MERGE | Casagrande Peña | <- | CasaGrande | eventos=3 | address=Casagrande Peña
MERGE | Casagrande Peña | <- | Casa Grande | eventos=3 | address=Casagrande Peña
MERGE | Casagrande Peña | <- | Casa Grande Peña | eventos=0 | address=Casagrande Peña
MERGE | Casagrande Peña | <- | Casagrande Salta | eventos=1 | address=Casagrande Peña
MERGE | Casagrande Peña | <- | casagrande.salta | eventos=0 | address=Casagrande Peña
MERGE | Casagrande Peña | <- | San martin 484 | eventos=1 | address=San martin 484
MERGE | Casona del Sur | <- | La Casona del Sur | eventos=0 | address=Casona del Sur
MERGE | Casona del Sur | <- | Coronel moldes 399 | eventos=1 | address=Coronel moldes 399
MERGE | Centro de Convenciones Salta | <- | Centro de Convenciones de Salta | eventos=1 | address=Centro de Convenciones Salta, Salta, Salta
MERGE | Coco Club | <- | CocoClub | eventos=1 | address=Coco Club
MERGE | Coco Club | <- | Avenida Jhon F. Kennedy | eventos=4 | address=Avenida Jhon F. Kennedy
MERGE | Elephant | <- | Elephant Salta | eventos=1 | address=Elephant
MERGE | Fábrica de Música | <- | Fabrica de Musica | eventos=2 | address=Fábrica de Música, Salta
MERGE | Juan de los Palotes | <- | JP | eventos=2 | address=Juan de los Palotes
MERGE | Juan de los Palotes | <- | juandelospalotes.jp | eventos=3 | address=Juan de los Palotes
MERGE | Juan de los Palotes | <- | Av. J.F. Kennedy y Radio Gral. Paz de Cordoba | eventos=4 | address=Av. J.F. Kennedy y Radio Gral. Paz de Cordoba
MERGE | La Casona de Güemes | <- | Casona de Guemes | eventos=0 | address=La Casona de Güemes
MERGE | La Casona de Güemes | <- | La Casona Güemes | eventos=1 | address=La Casona de Güemes
MERGE | La Casona de Güemes | <- | La Casona de G\r\nuemes | eventos=1 | address=La Casona de Güemes
MERGE | La Casona de Güemes | <- | General Guemes 485 | eventos=3 | address=General Guemes 485
MERGE | La Güemesiana | <- | Balcarce 935 | eventos=3 | address=Balcarce 935
MERGE | La Mata | <- | La Mata Reggaeton | eventos=1 | address=La Mata
MERGE | La Metro | <- | Marcelino Freyre 1438-1498 | eventos=6 | address=Marcelino Freyre 1438-1498
MERGE | La Metro | <- | Marcelino Freyre 1438-1498 | eventos=1 | address=Marcelino Freyre 1438-1498
MERGE | LA ROKA | <- | La Roka Salta | eventos=1 | address=LA ROKA, salta, Salta
MERGE | LA ROKA | <- | Roka | eventos=1 | address=LA ROKA, salta, Salta
MERGE | LA ROKA | <- | Salta Roka | eventos=3 | address=LA ROKA, salta, Salta
MERGE | LA ROKA | <- | Saltaroka | eventos=5 | address=LA ROKA, salta, Salta
MERGE | One Club | <- | ONE | eventos=3 | address=One Club
MERGE | One Club | <- | One Oficial Salta | eventos=3 | address=One Club
MERGE | One Club | <- | Balcarce 920 | eventos=5 | address=Balcarce 920
MERGE | Salón Templo | <- | Salon Templo | eventos=1 | address=Salón Templo
MERGE | Salón Templo | <- | Gral. Richieri y Los Gladiolos | eventos=2 | address=Gral. Richieri y Los Gladiolos
MERGE | Teatro Provincial Juan Carlos Saravia | <- | Teatro Provincial JCS | eventos=1 | address=Teatro Provincial Juan Carlos Saravia
MERGE | Teatro Provincial Juan Carlos Saravia | <- | Teatro Provincial de Salta | eventos=1 | address=Zuviría 70, Salta
MERGE | Trewa Club | <- | Trewa | eventos=2 | address=Trewa Club
RENAME | LA ROKA -> La Roka
RENAME | Museo Antropologico -> Museo Antropológico
IG    | @la.guemesiana | Balcarce 935 -> La Güemesiana
IG    | @lacasonaguemes | General Guemes 485 -> La Casona de Güemes
IG    | @casonadelsur.salta | Coronel moldes 399 -> Casona del Sur
IG    | @casagrande.salta | San martin 484 -> Casagrande Peña
IG    | @amnesiasalta | Balcarce 899 -> Amnesia Pub & Música
IG    | @babylonsalta | Necochea 719 -> Babylon
IG    | @bounce.salta | Las Heras 1237 -> Bounce
IG    | @bunker.owl | Balcarce 926 -> Bunker Owl Music Bar
IG    | @cococlub.sla | Avenida Jhon F. Kennedy -> Coco Club
IG    | @juandelospalotes.jp | Av. J.F. Kennedy y Radio Gral. Paz de Cordoba -> Juan de los Palotes
IG    | @lametrosalta | Marcelino Freyre 1438-1498 -> La Metro
IG    | @oneoficialsalta | Balcarce 920 -> One Club
IG    | @salon.templo | Gral. Richieri y Los Gladiolos -> Salón Templo
IG    | @treintaypicosalta | Balcarce 865 -> 30 y Pico
IG    | @bolichebalderrama | Av. San Martín 1126 -> Balderrama
IG    | @peppers.gintoneria | Peppers Gintonería -> Peppers
IG    | @laviejaestacionensalta | Balcarce 875 -> La Vieja Estación
TOTAL | absorbidos=57 | eventos movidos=137 | canónicos=87 | en revisión=17
```
